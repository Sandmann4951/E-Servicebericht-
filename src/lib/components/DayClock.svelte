<script lang="ts">
  import { getActiveWorkDay } from '../db/workDays';
  import { getGloballyActiveTimeEntry } from '../db/timeEntries';
  import { getReport, createReport } from '../db/reports';
  import type { WorkDay, TimeEntry, ServiceReport } from '../db/types';
  import { checkInDay, checkOutDay, switchToProject, type DaySummary } from '../clockActions';
  import { getTechnicianName } from '../settings';
  import { navigate } from '../router.svelte';
  import { computeDurationMinutes, formatDurationMinutes, nowHHmm } from '../utils/date';

  let workDay = $state<WorkDay | undefined>(undefined);
  let activeEntry = $state<TimeEntry | undefined>(undefined);
  let activeReport = $state<ServiceReport | undefined>(undefined);
  let loading = $state(true);
  let busy = $state(false);
  let quickClockInBusy = $state(false);
  let daySummary = $state<DaySummary | undefined>(undefined);
  /** Nur zum periodischen Neuberechnen der Anzeige - kein eigener Nutzwert. */
  let tick = $state(0);

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
    } finally {
      busy = false;
    }
  }

  function dismissSummary(): void {
    daySummary = undefined;
  }

  /**
   * Schnellzugriff für den häufigsten Fall: beim Kunden ankommen und sofort
   * loslegen, ohne erst separat den Tag einzustempeln. Fragt nur die
   * Projektnummer ab (per prompt(), passt zu den bereits genutzten nativen
   * Bestätigungsdialogen in der App), legt den Bericht an und wechselt direkt
   * hinein - switchToProject() startet dabei bei Bedarf transparent den Tag.
   */
  async function quickClockIn(): Promise<void> {
    if (quickClockInBusy) return;
    const projectNumber = prompt('Projektnummer für den neuen Bericht:');
    if (!projectNumber?.trim()) return;
    quickClockInBusy = true;
    try {
      const report = await createReport({ projectNumber: projectNumber.trim(), technicianName: getTechnicianName() || undefined });
      await switchToProject(report.id);
      navigate(`/reports/${report.id}`);
    } finally {
      quickClockInBusy = false;
    }
  }
</script>

{#if !loading}
  <div class="day-clock">
    {#if daySummary}
      <div class="day-summary">
        <p class="day-summary-title">✅ Tag ausgecheckt</p>
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
          Eingestempelt in „{activeReport.projectNumber}“ seit {activeEntry?.startTime}
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
        <button type="button" class="quick-clock-in" onclick={quickClockIn} disabled={quickClockInBusy}>
          + Direkt in Projekt einstempeln
        </button>
      {/if}
      {#if workDay}
        <button type="button" class="check-out" onclick={checkOut} disabled={busy}>⏹ Tag auschecken</button>
      {/if}
    </div>
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
</style>
