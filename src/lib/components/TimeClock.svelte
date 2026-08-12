<script lang="ts">
  import { getActiveTimeEntry, updateTimeEntry } from '../db/timeEntries';
  import type { TimeEntry } from '../db/types';
  import { switchToIdle, switchToProject } from '../clockActions';
  import { computeDurationMinutes, formatDurationMinutes, nowHHmm } from '../utils/date';

  let { reportId, locked = false, onChanged }: { reportId: string; locked?: boolean; onChanged: () => void } = $props();

  let activeEntry = $state<TimeEntry | undefined>(undefined);
  let loading = $state(true);
  let busy = $state(false);
  /** Nur zum periodischen Neuberechnen der Anzeige - kein eigener Nutzwert. */
  let tick = $state(0);

  async function load(): Promise<void> {
    loading = true;
    activeEntry = await getActiveTimeEntry(reportId);
    loading = false;
  }

  $effect(() => {
    reportId;
    load();
  });

  // Während eingestempelt ist, die Anzeige regelmäßig auffrischen, damit die
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

  async function clockIn(): Promise<void> {
    if (busy || activeEntry || locked) return;
    busy = true;
    try {
      if (!(await switchToProject(reportId))) return;
      await load();
      onChanged();
    } finally {
      busy = false;
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
      <div class="active-badge">
        <span class="dot"></span>
        <span>
          Eingestempelt seit {activeEntry.startTime}
          {#if elapsedMinutes !== undefined}· {formatDurationMinutes(elapsedMinutes)}{/if}
        </span>
      </div>
      {#if !locked}
        <button type="button" class="clock-out" onclick={clockOut} disabled={busy}>⏹ Ausstempeln</button>
      {/if}
    {:else if locked}
      <p class="locked-hint">Bericht ist gesperrt – Zeiterfassung nicht mehr möglich.</p>
    {:else}
      <button type="button" class="clock-in" onclick={clockIn} disabled={busy}>▶️ Einstempeln</button>
    {/if}
  </div>
{/if}

<style>
  .clock {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .clock-in,
  .clock-out {
    border: none;
    border-radius: var(--radius-md);
    padding: var(--space-4);
    font-weight: 700;
    font-size: 1.05rem;
  }

  .clock-in {
    background: var(--color-success);
    color: var(--color-primary-contrast);
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
