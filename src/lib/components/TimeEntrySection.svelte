<script lang="ts">
  import { addTimeEntry, deleteTimeEntry, listTimeEntries, updateTimeEntry } from '../db/timeEntries';
  import type { TimeEntry } from '../db/types';
  import { computeDurationMinutes, formatDateDE, formatDurationMinutes, todayISODate } from '../utils/date';

  let { reportId, onChanged }: { reportId: string; onChanged: () => void } = $props();

  let entries = $state<TimeEntry[]>([]);
  let loading = $state(true);
  let showForm = $state(false);
  let editingId = $state<string | undefined>();

  let formDate = $state(todayISODate());
  let formStart = $state('');
  let formEnd = $state('');
  let formNote = $state('');

  async function load(): Promise<void> {
    loading = true;
    entries = await listTimeEntries(reportId);
    loading = false;
  }

  $effect(() => {
    reportId;
    load();
  });

  const previewDuration = $derived(formStart && formEnd ? computeDurationMinutes(formStart, formEnd) : undefined);

  function resetForm(): void {
    formDate = todayISODate();
    formStart = '';
    formEnd = '';
    formNote = '';
    editingId = undefined;
    showForm = false;
  }

  function startAdd(): void {
    resetForm();
    showForm = true;
  }

  function startEdit(entry: TimeEntry): void {
    editingId = entry.id;
    formDate = entry.date;
    formStart = entry.startTime ?? '';
    formEnd = entry.endTime ?? '';
    formNote = entry.note ?? '';
    showForm = true;
  }

  async function save(): Promise<void> {
    if (!formDate) return;
    const payload = {
      date: formDate,
      startTime: formStart || undefined,
      endTime: formEnd || undefined,
      note: formNote
    };
    if (editingId) {
      await updateTimeEntry(editingId, payload);
    } else {
      await addTimeEntry(reportId, payload);
    }
    resetForm();
    await load();
    onChanged();
  }

  async function remove(entry: TimeEntry): Promise<void> {
    if (!confirm('Diesen Zeiteintrag löschen?')) return;
    await deleteTimeEntry(entry.id);
    if (editingId === entry.id) resetForm();
    await load();
    onChanged();
  }
</script>

<div class="section">
  {#if loading}
    <p class="hint">Lade Zeiten…</p>
  {:else}
    {#if entries.length === 0 && !showForm}
      <p class="hint">Noch keine Zeiten erfasst.</p>
    {/if}
    {#if entries.length > 0}
      <ul class="list">
        {#each entries as entry (entry.id)}
          <li class="row">
            <button type="button" class="row-main" onclick={() => startEdit(entry)}>
              <span class="date">{formatDateDE(entry.date)}</span>
              <span class="meta">
                {#if entry.startTime && entry.endTime}{entry.startTime}–{entry.endTime} Uhr ·{/if}
                {formatDurationMinutes(entry.durationMinutes)}
              </span>
              {#if entry.note}<span class="note">{entry.note}</span>{/if}
            </button>
            <button type="button" class="delete" aria-label="Zeiteintrag löschen" onclick={() => remove(entry)}>🗑</button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}

  {#if showForm}
    <form
      class="form"
      onsubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label>
        Datum
        <input type="date" bind:value={formDate} required />
      </label>
      <div class="two-col">
        <label>
          Start
          <input type="time" bind:value={formStart} />
        </label>
        <label>
          Ende
          <input type="time" bind:value={formEnd} />
        </label>
      </div>
      {#if previewDuration !== undefined}
        <p class="duration-preview">Dauer: {formatDurationMinutes(previewDuration)}</p>
      {/if}
      <label>
        Notiz (optional)
        <textarea rows="2" bind:value={formNote} placeholder="z.B. Fehlersuche, Inbetriebnahme…"></textarea>
      </label>
      <div class="form-actions">
        <button type="button" class="ghost" onclick={resetForm}>Abbrechen</button>
        <button type="submit" class="primary">Speichern</button>
      </div>
    </form>
  {:else}
    <button type="button" class="add" onclick={startAdd}>+ Tag hinzufügen</button>
  {/if}
</div>

<style>
  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .hint {
    color: var(--color-text-muted);
    text-align: center;
    margin: var(--space-4) 0;
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

  .row-main {
    flex: 1;
    text-align: left;
    background: transparent;
    border: none;
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-height: auto;
  }

  .date {
    font-weight: 600;
  }

  .meta {
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }

  .note {
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }

  .delete {
    background: transparent;
    border: none;
    color: var(--color-danger);
    padding: 0 var(--space-3);
    min-height: auto;
    font-size: 1.1rem;
  }

  .add {
    background: var(--color-surface);
    border: 1px dashed var(--color-primary);
    color: var(--color-primary);
    border-radius: var(--radius-md);
    font-weight: 600;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-4);
  }

  .form label {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }

  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }

  .duration-preview {
    margin: 0;
    font-size: 0.85rem;
    color: var(--color-primary);
    font-weight: 600;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .ghost {
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-4);
    min-height: auto;
  }

  .primary {
    background: var(--color-primary);
    color: var(--color-primary-contrast);
    border: none;
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-4);
    min-height: auto;
    font-weight: 600;
  }
</style>
