<script lang="ts">
  import { listUnassignedIdleEntries } from '../lib/db/timeEntries';
  import { listReports } from '../lib/db/reports';
  import { reassignIdleEntry } from '../lib/clockActions';
  import type { ServiceReport, TimeEntry } from '../lib/db/types';
  import { navigate } from '../lib/router.svelte';
  import { formatDateDE, formatDurationMinutes } from '../lib/utils/date';
  import { exceedsMaxDailyWork } from '../lib/utils/arbzg';
  import Icon from '../lib/components/Icon.svelte';

  let entries = $state<TimeEntry[]>([]);
  let loading = $state(true);
  let assignBusy = $state(false);
  let pickerEntryId = $state<string | undefined>(undefined);
  let pickerQuery = $state('');
  let assignableReports = $state<ServiceReport[]>([]);

  async function load(): Promise<void> {
    loading = true;
    entries = await listUnassignedIdleEntries();
    loading = false;
  }

  $effect(() => {
    load();
  });

  // Nur nicht gesperrte Berichte lassen sich zuordnen - ein gesperrter
  // Bericht darf sich nachträglich nicht mehr ändern (siehe finalizeReport()).
  $effect(() => {
    listReports('all').then((all) => {
      assignableReports = all.filter((report) => !report.finalizedAt);
    });
  });

  const filteredAssignableReports = $derived.by(() => {
    const query = pickerQuery.trim().toLowerCase();
    if (!query) return assignableReports;
    return assignableReports.filter(
      (report) =>
        report.projectNumber.toLowerCase().includes(query) || (report.customer ?? '').toLowerCase().includes(query)
    );
  });

  function openPicker(entryId: string): void {
    pickerEntryId = entryId;
    pickerQuery = '';
  }

  function closePicker(): void {
    pickerEntryId = undefined;
  }

  async function assignTo(entryId: string, reportId: string): Promise<void> {
    if (assignBusy) return;
    assignBusy = true;
    try {
      await reassignIdleEntry(entryId, reportId);
      pickerEntryId = undefined;
      await load();
    } finally {
      assignBusy = false;
    }
  }
</script>

<div class="screen">
  <header class="header">
    <button type="button" class="back" onclick={() => navigate('/')} aria-label="Zurück zur Übersicht"><Icon name="back" /></button>
    <h1>Leerlaufzeiten</h1>
  </header>

  <div class="content">
    {#if loading}
      <p class="hint">Lade Leerlaufzeiten…</p>
    {:else if entries.length === 0}
      <div class="empty">
        <p>Keine unzugeordneten Leerlaufzeiten vorhanden.</p>
        <p class="hint">Zeit, die eingestempelt, aber keinem Projekt zugeordnet war, erscheint hier zur Nachzuordnung.</p>
      </div>
    {:else}
      <ul class="list">
        {#each entries as entry (entry.id)}
          {@const exceedsMax = exceedsMaxDailyWork(entry.durationMinutes)}
          <li class="row" class:exceeds-max={exceedsMax}>
            <div class="row-main">
              <span class="date">{formatDateDE(entry.date)}</span>
              <span class="meta">
                {#if entry.startTime && entry.endTime}{entry.startTime}–{entry.endTime} Uhr ·{/if}
                {formatDurationMinutes(entry.durationMinutes)}
                {#if exceedsMax}
                  <span class="max-hint" title="Überschreitet die gesetzliche Höchstarbeitszeit (10 Std./Tag) - bitte prüfen.">
                    <Icon name="alert-triangle" size={13} />
                  </span>
                {/if}
              </span>
            </div>
            <button type="button" class="assign" onclick={() => openPicker(entry.id)}>Zuordnen</button>
          </li>
          {#if pickerEntryId === entry.id}
            <li class="picker">
              <input
                type="search"
                bind:value={pickerQuery}
                placeholder="Bericht suchen (Projektnummer, Kunde)…"
                aria-label="Bericht suchen"
              />
              {#if filteredAssignableReports.length === 0}
                <p class="hint">Keine passenden Berichte gefunden.</p>
              {:else}
                <ul class="picker-list">
                  {#each filteredAssignableReports as report (report.id)}
                    <li>
                      <button type="button" onclick={() => assignTo(entry.id, report.id)} disabled={assignBusy}>
                        <strong>{report.projectNumber}</strong>
                        {#if report.customer}<span> · {report.customer}</span>{/if}
                      </button>
                    </li>
                  {/each}
                </ul>
              {/if}
              <button type="button" class="cancel" onclick={closePicker}>Abbrechen</button>
            </li>
          {/if}
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .screen {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: calc(var(--space-3) + var(--safe-top)) var(--space-3) var(--space-3);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface);
  }

  .header h1 {
    flex: 1;
    margin: 0;
    font-size: 1.1rem;
  }

  .back {
    background: transparent;
    border: none;
    font-size: 1.2rem;
    padding: var(--space-2);
    min-height: auto;
  }

  .content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4);
    padding-bottom: calc(var(--space-6) + var(--safe-bottom));
  }

  .hint {
    color: var(--color-text-muted);
    text-align: center;
    margin: var(--space-4) 0;
  }

  .empty {
    text-align: center;
    margin-top: var(--space-6);
    color: var(--color-text-muted);
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .row {
    display: flex;
    align-items: stretch;
    gap: var(--space-2);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }

  .row.exceeds-max {
    background: var(--color-danger-bg);
    border-color: var(--color-danger);
  }

  .row-main {
    flex: 1;
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .date {
    font-weight: 600;
  }

  .meta {
    font-size: 0.85rem;
    color: var(--color-text-muted);
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .max-hint {
    display: inline-flex;
    color: var(--color-danger);
  }

  .assign {
    background: transparent;
    border: none;
    color: var(--color-primary);
    font-weight: 600;
    padding: 0 var(--space-3);
    min-height: auto;
  }

  .picker {
    background: var(--color-surface-muted);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .picker input {
    background: var(--color-surface);
  }

  .picker-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    max-height: 200px;
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

  .cancel {
    align-self: flex-start;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-4);
    min-height: auto;
    font-size: 0.85rem;
  }
</style>
