<script lang="ts">
  /**
   * "Woran arbeitest du gerade?" in der Übersicht: schreibt direkt in die
   * Notiz des laufenden Zeitabschnitts (bzw. des letzten Abschnitts von
   * heute, siehe utils/currentWorkEntry.ts) - dieselbe Notiz, die bisher nur
   * im Reiter "Zeiten" nachgetragen werden konnte. Der Bericht übernimmt sie
   * von dort in "Durchgeführte Arbeiten" (onSaved -> performedWorkSync.ts).
   */
  import { listTimeEntries, updateTimeEntry } from '../db/timeEntries';
  import { debounce } from '../utils/debounce';
  import { todayISODate } from '../utils/date';
  import { appendDictatedText } from '../utils/dictation';
  import { pickCurrentWorkEntry, type CurrentWorkTarget } from '../utils/currentWorkEntry';
  import DictateButton from './DictateButton.svelte';

  let {
    reportId,
    locked = false,
    // Erhöht sich, sobald sich die Zeiten des Berichts geändert haben
    // (Ein-/Auschecken) - nur um neu zu laden.
    version = 0,
    onSaved
  }: { reportId: string; locked?: boolean; version?: number; onSaved: () => void | Promise<void> } = $props();

  let target = $state<CurrentWorkTarget | undefined>(undefined);
  let draft = $state('');
  let loading = $state(true);
  let pending: { id: string; note: string } | undefined;

  async function persist(): Promise<void> {
    if (!pending) return;
    const { id, note } = pending;
    pending = undefined;
    await updateTimeEntry(id, { note });
    await onSaved();
  }

  const scheduled = debounce(() => void persist(), 700);

  async function load(): Promise<void> {
    scheduled.cancel();
    await persist();
    const next = pickCurrentWorkEntry(await listTimeEntries(reportId), todayISODate());
    if (next?.entry.id !== target?.entry.id) draft = next?.entry.note ?? '';
    target = next;
    loading = false;
  }

  $effect(() => {
    reportId;
    version;
    void load();
  });

  $effect(() => {
    return () => {
      scheduled.cancel();
      void persist();
    };
  });

  function onInput(): void {
    if (!target) return;
    pending = { id: target.entry.id, note: draft };
    scheduled.run();
  }

  function onDictated(text: string): void {
    draft = appendDictatedText(draft, text);
    onInput();
  }

  const label = $derived(
    !target
      ? ''
      : target.entry.isTravel
        ? 'Notiz zur Fahrtzeit'
        : target.mode === 'active'
          ? 'Woran arbeitest du gerade?'
          : 'Was hast du heute gemacht?'
  );
  const slot = $derived(
    !target
      ? ''
      : target.mode === 'active'
        ? `seit ${target.entry.startTime} Uhr`
        : `${target.entry.startTime}–${target.entry.endTime} Uhr`
  );
</script>

{#if !loading}
  {#if target}
    <div class="dictate-field current-work">
      <label>
        <span class="current-work-label">{label} <span class="slot">· {slot}</span></span>
        <textarea
          rows="3"
          bind:value={draft}
          oninput={onInput}
          onblur={() => scheduled.flush()}
          placeholder="z.B. Zählerschrank verdrahtet, Wallbox montiert…"
          disabled={locked}
        ></textarea>
      </label>
      {#if !locked}<DictateButton onText={onDictated} />{/if}
      <p class="current-work-hint">Wird diesem Zeitabschnitt zugeordnet und in „Durchgeführte Arbeiten“ übernommen.</p>
    </div>
  {:else if !locked}
    <p class="current-work-empty">Nach dem Einchecken kannst du hier eintragen, woran du arbeitest.</p>
  {/if}
{/if}

<style>
  .current-work {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-3);
  }

  .current-work label {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .current-work-label {
    font-weight: 600;
    color: var(--color-text);
    padding-right: 84px;
  }

  .slot {
    font-weight: 400;
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .current-work-hint,
  .current-work-empty {
    margin: var(--space-2) 0 0;
    font-size: 0.78rem;
    color: var(--color-text-muted);
  }

  .current-work-empty {
    margin: 0;
    text-align: center;
  }

  .current-work :global(.dictate-btn) {
    top: var(--space-3);
    right: var(--space-3);
  }
</style>
