<script lang="ts">
  import { getActiveTimeEntry, updateTimeEntry } from '../db/timeEntries';
  import type { TimeEntry } from '../db/types';
  import { endTravel, isReturnTravel, switchToIdle, switchToProject, switchToTravel } from '../clockActions';
  import { computeDurationMinutes, formatDurationMinutes, nowHHmm } from '../utils/date';
  import Icon from './Icon.svelte';

  let { reportId, locked = false, onChanged }: { reportId: string; locked?: boolean; onChanged: () => void } = $props();

  let activeEntry = $state<TimeEntry | undefined>(undefined);
  /** Nur bei laufender Fahrtzeit relevant: Rückfahrt (nur noch Auschecken) statt Hinfahrt (nur Einchecken). */
  let returnTravel = $state(false);
  let loading = $state(true);
  let busy = $state(false);
  /** Nur zum periodischen Neuberechnen der Anzeige - kein eigener Nutzwert. */
  let tick = $state(0);

  async function load(): Promise<void> {
    loading = true;
    activeEntry = await getActiveTimeEntry(reportId);
    returnTravel = activeEntry?.isTravel ? await isReturnTravel(activeEntry) : false;
    loading = false;
  }

  $effect(() => {
    reportId;
    load();
  });

  // Während eingecheckt ist, die Anzeige regelmäßig auffrischen, damit die
  // gelaufene Zeit sichtbar mitläuft (kein aufwendiges Live-Ticking pro
  // Sekunde nötig - alle 30s reicht für eine Zeiterfassungs-Anzeige völlig).
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

  async function clockIn(travel = false): Promise<void> {
    if (busy || activeEntry || locked) return;
    busy = true;
    try {
      if (!(await (travel ? switchToTravel(reportId) : switchToProject(reportId)))) return;
      await load();
      onChanged();
    } finally {
      busy = false;
    }
  }

  /**
   * Wechselt innerhalb dieses Projekts zwischen Arbeit und Fahrtzeit:
   * "Fahrtzeit starten" (Rückfahrt) aus der Projektzeit heraus bzw.
   * "Fahrtzeit beenden & einchecken" (Ankunft) aus der Hinfahrt heraus.
   */
  async function switchMode(travel: boolean): Promise<void> {
    if (busy || !activeEntry || locked) return;
    busy = true;
    try {
      if (!(await (travel ? switchToTravel(reportId) : endTravel(reportId)))) return;
      await load();
      onChanged();
    } finally {
      busy = false;
    }
  }

  /**
   * Beim Beenden einer Fahrtzeit (Hinfahrt: "Fahrtzeit beenden & einchecken",
   * Rückfahrt: "Auschecken") wird zuerst nach den gefahrenen Kilometern
   * gefragt. Sie landen direkt am Fahrtzeit-Eintrag (TimeEntry.kilometers)
   * und sind damit in den Zeiten und im Word-Export sichtbar. Leer lassen =
   * keine Angabe, "Abbrechen" = Fahrtzeit läuft weiter.
   */
  let kmPrompt = $state<{ travelEntry: TimeEntry; returnTrip: boolean } | undefined>(undefined);
  let kmInput = $state('');

  function askKilometers(): void {
    if (busy || !activeEntry?.isTravel || locked) return;
    kmInput = activeEntry.kilometers !== undefined ? String(activeEntry.kilometers).replace('.', ',') : '';
    kmPrompt = { travelEntry: activeEntry, returnTrip: returnTravel };
  }

  /** Setzt den Fokus direkt ins Kilometer-Feld, damit auf dem Handy sofort die Zahlentastatur aufgeht. */
  function focusOnOpen(node: HTMLInputElement): void {
    node.focus();
    node.select();
  }

  /** Leeres Feld = keine Angabe; Komma oder Punkt als Dezimaltrenner. */
  function parseKilometers(value: string): number | undefined {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const km = Number(trimmed.replace(',', '.'));
    return Number.isFinite(km) && km >= 0 ? km : undefined;
  }

  async function confirmKilometers(): Promise<void> {
    if (!kmPrompt) return;
    const { travelEntry, returnTrip } = kmPrompt;
    const kilometers = parseKilometers(kmInput);
    kmPrompt = undefined;
    if (kilometers !== undefined) {
      await updateTimeEntry(travelEntry.id, { kilometers });
    }
    if (returnTrip) {
      await clockOut();
    } else {
      await switchMode(false);
    }
  }

  async function clockOut(): Promise<void> {
    if (busy || !activeEntry || locked) return;
    busy = true;
    try {
      if (activeEntry.workDayId) {
        // Über die Tagesstempeluhr erfasst - Leerlaufzeit läuft weiter, statt
        // einfach nur zu schließen (Tag ist ja weiterhin aktiv).
        await switchToIdle();
      } else {
        // Alt-Eintrag ohne Tagesstempel-Verknüpfung - einfach schließen.
        await updateTimeEntry(activeEntry.id, { endTime: nowHHmm() });
      }
      await load();
      onChanged();
    } finally {
      busy = false;
    }
  }
</script>

{#if !loading}
  <div class="clock">
    {#if activeEntry}
      <div class="active-badge" class:travel={activeEntry.isTravel}>
        <span class="dot"></span>
        <span>
          {activeEntry.isTravel ? 'Fahrtzeit seit' : 'Eingecheckt seit'} {activeEntry.startTime}
          {#if elapsedMinutes !== undefined}· {formatDurationMinutes(elapsedMinutes)}{/if}
        </span>
      </div>
      {#if !locked}
        <!--
          Hinfahrt: nur "Fahrtzeit beenden & einchecken". Projektzeit:
          "Auschecken" oder "Fahrtzeit starten" für die Rückfahrt. Rückfahrt:
          nur noch "Auschecken" (siehe isReturnTravel()).
        -->
        {#if activeEntry.isTravel && returnTravel}
          <button type="button" class="clock-out" onclick={askKilometers} disabled={busy}><Icon name="stop" />Auschecken</button>
        {:else if activeEntry.isTravel}
          <button type="button" class="clock-in" onclick={askKilometers} disabled={busy}><Icon name="play" />Fahrtzeit beenden &amp; einchecken</button>
        {:else}
          <div class="button-row">
            <button type="button" class="clock-out" onclick={clockOut} disabled={busy}><Icon name="stop" />Auschecken</button>
            <button type="button" class="clock-in travel" onclick={() => switchMode(true)} disabled={busy}><Icon name="truck" />Fahrtzeit starten</button>
          </div>
        {/if}
      {/if}
    {:else if locked}
      <p class="locked-hint">Bericht ist gesperrt – Zeiterfassung nicht mehr möglich.</p>
    {:else}
      <div class="button-row">
        <button type="button" class="clock-in" onclick={() => clockIn()} disabled={busy}><Icon name="play" />Einchecken</button>
        <button type="button" class="clock-in travel" onclick={() => clockIn(true)} disabled={busy}><Icon name="truck" />Fahrtzeit</button>
      </div>
    {/if}
  </div>
{/if}

{#if kmPrompt}
  <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="km-title">
    <form
      class="dialog"
      onsubmit={(event) => {
        event.preventDefault();
        void confirmKilometers();
      }}
    >
      <h2 id="km-title">{kmPrompt.returnTrip ? 'Rückfahrt' : 'Hinfahrt'}: gefahrene Kilometer</h2>
      <label>
        Kilometer
        <input type="text" inputmode="decimal" bind:value={kmInput} placeholder="z.B. 42" use:focusOnOpen />
      </label>
      <p class="km-hint">Leer lassen, wenn du es nicht weißt. Du kannst die Kilometer später in den Zeiten nachtragen.</p>
      <div class="dialog-actions">
        <button type="button" class="ghost" onclick={() => (kmPrompt = undefined)}>Abbrechen</button>
        <button type="submit" class="primary">{kmPrompt.returnTrip ? 'Auschecken' : 'Einchecken'}</button>
      </div>
    </form>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: var(--space-4);
  }

  .dialog {
    width: 100%;
    max-width: 380px;
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    box-shadow: 0 20px 48px var(--color-shadow);
  }

  .dialog h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  .dialog label {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }

  .km-hint {
    margin: 0;
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .ghost {
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-4);
  }

  .primary {
    background: var(--color-primary);
    color: var(--color-primary-contrast);
    border: none;
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-4);
    font-weight: 600;
  }

  .clock {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .clock-in,
  .clock-out {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border: none;
    border-radius: var(--radius-md);
    padding: var(--space-4);
    font-weight: 700;
    font-size: 1.05rem;
  }

  .button-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
  }

  .clock-in {
    background: var(--color-success);
    color: var(--color-primary-contrast);
  }

  .clock-in.travel {
    background: var(--color-primary);
  }

  .clock-out {
    background: var(--color-danger);
    color: var(--color-primary-contrast);
  }

  .clock-in:disabled,
  .clock-out:disabled {
    opacity: 0.6;
  }

  .locked-hint {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 0.85rem;
    text-align: center;
  }

  .active-badge {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    background: var(--color-open-bg);
    color: var(--color-open);
    border-radius: var(--radius-md);
    padding: var(--space-3) var(--space-4);
    font-weight: 600;
    font-size: 0.9rem;
  }

  .active-badge.travel {
    background: var(--color-surface);
    color: var(--color-primary);
    border: 1px solid var(--color-primary);
  }

  .active-badge.travel .dot {
    background: var(--color-primary);
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
</style>
