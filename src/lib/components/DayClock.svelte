<script lang="ts">
  import { getActiveWorkDay } from '../db/workDays';
  import { getGloballyActiveTimeEntry } from '../db/timeEntries';
  import { getReport, listReports } from '../db/reports';
  import type { WorkDay, TimeEntry, ServiceReport } from '../db/types';
  import { checkInDay, checkOutDay, switchToProject, startProjectByNumber, type DaySummary } from '../clockActions';
  import { getTechnicianName } from '../settings';
  import { navigate } from '../router.svelte';
  import { computeDurationMinutes, formatDurationMinutes, nowHHmm } from '../utils/date';

  /** Optional: informiert die Elternkomponente (ReportList), wenn sich der Eingecheckt-Status geändert haben könnte - z.B. für die Anpinnen/Hervorheben-Anzeige in der Berichtsliste. */
  let { onChanged = () => {} }: { onChanged?: () => void } = $props();

  let workDay = $state<WorkDay | undefined>(undefined);
  let activeEntry = $state<TimeEntry | undefined>(undefined);
  let activeReport = $state<ServiceReport | undefined>(undefined);
  let loading = $state(true);
  let busy = $state(false);
  let quickClockInBusy = $state(false);
  let daySummary = $state<DaySummary | undefined>(undefined);
  /** Nur zum periodischen Neuberechnen der Anzeige - kein eigener Nutzwert. */
  let tick = $state(0);

  // Auswahl-Panel für "Direkt einchecken": zeigt zuerst die noch offenen
  // Berichte zur Auswahl, statt sofort nach einer neuen Projektnummer zu
  // fragen - erspart ein versehentliches Duplikat, wenn an einem bereits
  // laufenden Projekt weitergearbeitet wird.
  let pickerOpen = $state(false);
  let pickerQuery = $state('');
  let openReports = $state<ServiceReport[]>([]);
  let loadingOpenReports = $state(false);

  const filteredOpenReports = $derived.by(() => {
    const query = pickerQuery.trim().toLowerCase();
    if (!query) return openReports;
    return openReports.filter(
      (report) =>
        report.projectNumber.toLowerCase().includes(query) || (report.customer ?? '').toLowerCase().includes(query)
    );
  });

  async function load(): Promise<void> {
    loading = true;
    workDay = await getActiveWorkDay();
    if (workDay) {
      activeEntry = await getGloballyActiveTimeEntry();
      activeReport = activeEntry?.reportId ? await getReport(activeEntry.reportId) : undefined;
    } else {
      activeEntry = undefined;
      activeReport = undefined;
    }
    loading = false;
  }

  // Läuft einmal beim Mount - reicht aus, da diese Komponente bei jedem
  // Zurücknavigieren zur Liste ohnehin frisch gemountet wird.
  $effect(() => {
    load();
  });

  $effect(() => {
    if (!activeEntry) return;
    const interval = setInterval(() => (tick += 1), 30_000);
    return () => clearInterval(interval);
  });

  const elapsedMinutes = $derived.by(() => {
    tick;
    if (!activeEntry?.startTime) return undefined;
    return computeDurationMinutes(activeEntry.startTime, nowHHmm());
  });

  async function checkIn(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      await checkInDay();
      daySummary = undefined;
      await load();
      onChanged();
    } finally {
      busy = false;
    }
  }

  async function checkOut(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      daySummary = await checkOutDay();
      await load();
      onChanged();
    } finally {
      busy = false;
    }
  }

  function dismissSummary(): void {
    daySummary = undefined;
  }

  /**
   * Öffnet das Auswahl-Panel für "Direkt einchecken": lädt zuerst die noch
   * offenen Berichte, damit man an einem bereits laufenden Projekt
   * weiterarbeiten kann, ohne aus Versehen ein Duplikat mit derselben
   * Projektnummer anzulegen. Passt zu keinem davon (oder ist es das erste
   * Mal), legt "+ Neuen Bericht anlegen" im Panel wie gehabt per
   * Projektnummer-Eingabe einen neuen Bericht an.
   */
  async function openPicker(): Promise<void> {
    pickerOpen = true;
    pickerQuery = '';
    loadingOpenReports = true;
    openReports = await listReports('open');
    loadingOpenReports = false;
  }

  function closePicker(): void {
    pickerOpen = false;
  }

  async function selectOpenReport(report: ServiceReport): Promise<void> {
    if (quickClockInBusy) return;
    quickClockInBusy = true;
    try {
      closePicker();
      await switchToProject(report.id);
      navigate(`/reports/${report.id}`);
    } finally {
      quickClockInBusy = false;
    }
  }

  /**
   * Fällt zurück auf den bisherigen Ablauf, wenn keiner der offenen Berichte
   * passt: Projektnummer abfragen (per prompt()), dann über
   * startProjectByNumber() auflösen - das legt entweder einen neuen Bericht
   * an oder verhindert ein Duplikat, falls zu dieser Projektnummer bereits
   * ein offener Bericht existiert (dann wird stattdessen dorthin gewechselt).
   * In beiden Sonderfällen (Wiederverwendung / bereits weitere Berichte zu
   * dieser Nummer) gibt es kurz eine Info per alert(), damit das nicht
   * unbemerkt passiert.
   */
  async function createNewViaPrompt(): Promise<void> {
    if (quickClockInBusy) return;
    const projectNumber = prompt('Projektnummer für den neuen Bericht:');
    if (!projectNumber?.trim()) return;
    quickClockInBusy = true;
    try {
      const result = await startProjectByNumber(projectNumber, getTechnicianName() || undefined);
      closePicker();
      await switchToProject(result.report.id);
      if (result.reused) {
        alert(
          `Für Projekt "${result.report.projectNumber}" ist bereits ein offener Bericht vorhanden – du wirst dort eingecheckt.`
        );
      } else if (result.visitTotal > 1) {
        alert(
          `Neuer Bericht für Projekt "${result.report.projectNumber}" angelegt (${result.visitNumber}. Bericht zu diesem Projekt).`
        );
      }
      navigate(`/reports/${result.report.id}`);
    } finally {
      quickClockInBusy = false;
    }
  }
</script>

{#if !loading}
  <div class="day-clock">
    {#if daySummary}
      <div class="day-summary">
        <p class="day-summary-title">✅ Tag ausgestempelt</p>
        <div class="stats">
          <div class="stat"><strong>{formatDurationMinutes(daySummary.totalMinutes)}</strong><span>Gesamt</span></div>
          <div class="stat"><strong>{formatDurationMinutes(daySummary.projectMinutes)}</strong><span>Projekt</span></div>
          <div class="stat"><strong>{formatDurationMinutes(daySummary.idleMinutes)}</strong><span>Leerlaufzeit</span></div>
        </div>
        <button type="button" class="dismiss" onclick={dismissSummary}>Schließen</button>
      </div>
    {/if}

    {#if activeReport}
      <button type="button" class="active-session" onclick={() => navigate(`/reports/${activeReport?.id}`)}>
        <span class="dot"></span>
        <span>
          Eingecheckt in „{activeReport.projectNumber}“ seit {activeEntry?.startTime}
          {#if elapsedMinutes !== undefined}· {formatDurationMinutes(elapsedMinutes)}{/if}
        </span>
      </button>
    {:else if activeEntry}
      <div class="idle-badge">
        <span class="dot"></span>
        <span>
          Leerlaufzeit läuft seit {activeEntry.startTime}
          {#if elapsedMinutes !== undefined}· {formatDurationMinutes(elapsedMinutes)}{/if}
        </span>
      </div>
    {/if}

    <div class="day-actions">
      {#if !workDay}
        <button type="button" class="check-in" onclick={checkIn} disabled={busy}>▶️ Tag einstempeln</button>
      {/if}
      {#if !activeReport}
        <button type="button" class="quick-clock-in" onclick={openPicker} disabled={quickClockInBusy}>
          + Direkt in Projekt einchecken
        </button>
      {/if}
      {#if workDay}
        <button type="button" class="check-out" onclick={checkOut} disabled={busy}>⏹ Tag ausstempeln</button>
      {/if}
    </div>

    {#if pickerOpen}
      <div class="project-picker">
        <input
          type="search"
          bind:value={pickerQuery}
          placeholder="Offenen Bericht suchen (Projektnummer, Kunde)…"
          aria-label="Offenen Bericht suchen"
        />
        {#if loadingOpenReports}
          <p class="picker-hint">Lade offene Berichte…</p>
        {:else if filteredOpenReports.length === 0}
          <p class="picker-hint">
            {openReports.length === 0 ? 'Keine offenen Berichte vorhanden.' : 'Keine passenden Berichte gefunden.'}
          </p>
        {:else}
          <ul class="picker-list">
            {#each filteredOpenReports as report (report.id)}
              <li>
                <button type="button" onclick={() => selectOpenReport(report)} disabled={quickClockInBusy}>
                  <strong>{report.projectNumber}</strong>
                  {#if report.customer}<span> · {report.customer}</span>{/if}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
        <div class="picker-actions">
          <button type="button" class="new-report" onclick={createNewViaPrompt} disabled={quickClockInBusy}>
            + Neuen Bericht anlegen
          </button>
          <button type="button" class="cancel" onclick={closePicker}>Abbrechen</button>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .day-clock {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0 var(--space-4) var(--space-3);
  }

  .day-summary {
    background: var(--color-completed-bg);
    border-radius: var(--radius-md);
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .day-summary-title {
    margin: 0;
    font-weight: 700;
    color: var(--color-completed);
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-2);
  }

  .stat {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-2);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .stat strong {
    font-size: 1rem;
  }

  .stat span {
    font-size: 0.7rem;
    color: var(--color-text-muted);
  }

  .dismiss {
    align-self: flex-start;
    background: transparent;
    border: 1px solid var(--color-completed);
    color: var(--color-completed);
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-4);
    min-height: auto;
    font-weight: 600;
    font-size: 0.8rem;
  }

  .active-session,
  .idle-badge {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    background: var(--color-open-bg);
    color: var(--color-open);
    border: none;
    border-radius: var(--radius-md);
    padding: var(--space-3) var(--space-4);
    font-weight: 600;
    font-size: 0.9rem;
    text-align: left;
  }

  .active-session {
    width: 100%;
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--color-open);
    flex-shrink: 0;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }

  .day-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .check-in,
  .check-out,
  .quick-clock-in {
    flex: 1;
    min-width: 140px;
    border: none;
    border-radius: var(--radius-md);
    padding: var(--space-3) var(--space-4);
    font-weight: 700;
    text-align: center;
  }

  .check-in,
  .quick-clock-in {
    background: var(--color-success);
    color: var(--color-primary-contrast);
  }

  .check-out {
    background: var(--color-danger);
    color: var(--color-primary-contrast);
  }

  .check-in:disabled,
  .check-out:disabled,
  .quick-clock-in:disabled {
    opacity: 0.6;
  }

  .project-picker {
    background: var(--color-surface-muted);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .project-picker input {
    background: var(--color-surface);
  }

  .picker-hint {
    margin: var(--space-2) 0;
    color: var(--color-text-muted);
    font-size: 0.85rem;
    text-align: center;
  }

  .picker-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    max-height: 240px;
    overflow-y: auto;
  }

  .picker-list button {
    width: 100%;
    text-align: left;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-3);
    min-height: auto;
    font-size: 0.9rem;
  }

  .picker-list button span {
    color: var(--color-text-muted);
  }

  .picker-actions {
    display: flex;
    gap: var(--space-2);
  }

  .new-report {
    flex: 1;
    background: transparent;
    border: 1px dashed var(--color-primary);
    color: var(--color-primary);
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-3);
    min-height: auto;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .cancel {
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-4);
    min-height: auto;
    font-size: 0.85rem;
  }

  .new-report:disabled {
    opacity: 0.6;
  }
</style>
