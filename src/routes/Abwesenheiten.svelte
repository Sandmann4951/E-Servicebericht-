<script lang="ts">
  import { getAbsence, listAbsencesInRange, removeAbsence, setAbsence } from '../lib/db/absences';
  import { listTimeEntriesForDate } from '../lib/db/timeEntries';
  import type { Absence, AbsenceType } from '../lib/db/types';
  import { navigate } from '../lib/router.svelte';
  import { formatDateDE, todayISODate } from '../lib/utils/date';
  import Icon, { type IconName } from '../lib/components/Icon.svelte';

  const TYPE_LABELS: Record<AbsenceType, string> = {
    vacation: 'Urlaub',
    sick: 'Krank',
    timeoff: 'Zeitausgleich'
  };

  const TYPE_ICONS: Record<AbsenceType, IconName> = {
    vacation: 'umbrella',
    sick: 'thermometer',
    timeoff: 'refresh-cw'
  };

  const TYPES: AbsenceType[] = ['vacation', 'sick', 'timeoff'];

  const today = todayISODate();

  let absences = $state<Absence[]>([]);
  let loading = $state(true);
  let selectedYear = $state(Number(today.slice(0, 4)));

  let formDate = $state(today);
  let formType = $state<AbsenceType>('vacation');
  let formNote = $state('');
  // Ist ein Eintrag für formDate schon vorhanden, wird er beim Speichern
  // automatisch überschrieben (siehe setAbsence()/Upsert-Kommentar in
  // absences.ts) - editingDate merkt sich nur, ob es sich um eine
  // Bearbeitung eines bereits existierenden Tages handelt (fürs Löschen-Icon
  // im Formular, rein kosmetisch).
  let editingDate = $state<string | undefined>(undefined);
  let saving = $state(false);

  async function load(): Promise<void> {
    loading = true;
    const list = await listAbsencesInRange(`${selectedYear}-01-01`, `${selectedYear}-12-31`);
    absences = list.sort((a, b) => a.date.localeCompare(b.date));
    loading = false;
  }

  $effect(() => {
    load();
  });

  const summary = $derived.by(() => {
    const counts: Record<AbsenceType, number> = { vacation: 0, sick: 0, timeoff: 0 };
    for (const absence of absences) counts[absence.type] += 1;
    return counts;
  });

  function resetForm(): void {
    formDate = today;
    formType = 'vacation';
    formNote = '';
    editingDate = undefined;
  }

  function startEdit(absence: Absence): void {
    editingDate = absence.date;
    formDate = absence.date;
    formType = absence.type;
    formNote = absence.note ?? '';
  }

  async function save(): Promise<void> {
    if (!formDate || saving) return;
    saving = true;
    try {
      // War für diesen Tag schon Arbeitszeit erfasst (Projekt- oder
      // Leerlaufzeit über die Tagesstempeluhr), lieber einmal nachfragen -
      // ein rückwirkend als Urlaub/Krank eingetragener Tag mit bereits
      // erfassten Zeiten ist meist ein Versehen, soll aber nicht blockiert
      // werden (z.B. nachträgliche Korrektur ist durchaus gewollt).
      const existingEntries = await listTimeEntriesForDate(formDate);
      if (existingEntries.length > 0) {
        const proceed = confirm(
          `Für den ${formatDateDE(formDate)} sind bereits Zeiten erfasst.\n\nTrotzdem als „${TYPE_LABELS[formType]}" eintragen?`
        );
        if (!proceed) return;
      }

      await setAbsence(formDate, formType, formNote);
      resetForm();
      await load();
    } finally {
      saving = false;
    }
  }

  async function remove(absence: Absence): Promise<void> {
    if (!confirm(`Eintrag „${TYPE_LABELS[absence.type]}" am ${formatDateDE(absence.date)} löschen?`)) return;
    await removeAbsence(absence.date);
    if (editingDate === absence.date) resetForm();
    await load();
  }

  async function onFormDateChange(): Promise<void> {
    // Beim manuellen Ändern des Datums (nicht per "Bearbeiten"-Tap) prüfen,
    // ob für diesen Tag schon eine Abwesenheit existiert, und das Formular
    // direkt damit befüllen - sonst würde ein Speichern hier den bestehenden
    // Eintrag stillschweigend überschreiben (Upsert-Verhalten von
    // setAbsence()), ohne dass sichtbar war, dass da schon etwas stand.
    if (!formDate) return;
    const existing = await getAbsence(formDate);
    if (existing) {
      editingDate = existing.date;
      formType = existing.type;
      formNote = existing.note ?? '';
    } else if (editingDate !== undefined) {
      editingDate = undefined;
      formNote = '';
    }
  }
</script>

<div class="screen">
  <header class="header">
    <button type="button" class="back" onclick={() => navigate('/')} aria-label="Zurück zur Übersicht">
      <Icon name="back" />
    </button>
    <h1>Abwesenheiten</h1>
  </header>

  <div class="content">
    <form
      class="form"
      onsubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label>
        Datum
        <input type="date" bind:value={formDate} onchange={onFormDateChange} required />
      </label>

      <div class="type-select" role="radiogroup" aria-label="Art der Abwesenheit">
        {#each TYPES as type (type)}
          <button
            type="button"
            role="radio"
            aria-checked={formType === type}
            class:active={formType === type}
            onclick={() => (formType = type)}
          >
            <Icon name={TYPE_ICONS[type]} />
            <span>{TYPE_LABELS[type]}</span>
          </button>
        {/each}
      </div>

      <label>
        Notiz (optional)
        <textarea rows="2" bind:value={formNote} placeholder="z.B. Rest-Urlaub, Reha, …"></textarea>
      </label>

      <div class="form-actions">
        {#if editingDate}
          <button type="button" class="ghost" onclick={resetForm}>Abbrechen</button>
        {/if}
        <button type="submit" class="primary" disabled={saving}>
          {editingDate ? 'Aktualisieren' : 'Eintragen'}
        </button>
      </div>
    </form>

    <div class="nav">
      <button type="button" onclick={() => (selectedYear -= 1)} aria-label="Vorheriges Jahr"><Icon name="chevron-left" /></button>
      <button type="button" class="nav-label" onclick={() => (selectedYear = Number(today.slice(0, 4)))}>
        {selectedYear}
      </button>
      <button type="button" onclick={() => (selectedYear += 1)} aria-label="Nächstes Jahr"><Icon name="chevron-right" /></button>
    </div>

    {#if loading}
      <p class="hint">Lade Abwesenheiten…</p>
    {:else}
      <p class="summary">
        {summary.vacation} Urlaub · {summary.sick} Krank · {summary.timeoff} Zeitausgleich in {selectedYear}
      </p>

      {#if absences.length === 0}
        <p class="empty">Keine Abwesenheiten für {selectedYear} eingetragen.</p>
      {:else}
        <ul class="list">
          {#each absences as absence (absence.date)}
            <li class="row">
              <button type="button" class="row-main" onclick={() => startEdit(absence)}>
                <span class="row-icon"><Icon name={TYPE_ICONS[absence.type]} /></span>
                <span class="row-text">
                  <span class="date">{formatDateDE(absence.date)}</span>
                  <span class="meta">{TYPE_LABELS[absence.type]}{#if absence.note} · {absence.note}{/if}</span>
                </span>
              </button>
              <button type="button" class="delete" aria-label="Abwesenheit löschen" onclick={() => remove(absence)}>
                <Icon name="trash" />
              </button>
            </li>
          {/each}
        </ul>
      {/if}
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
    padding: var(--space-2);
    min-height: auto;
    color: var(--color-text);
  }

  .content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4);
    padding-bottom: calc(var(--space-6) + var(--safe-bottom));
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
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

  .type-select {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-2);
  }

  .type-select button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    background: var(--color-surface-muted);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-2);
    font-size: 0.78rem;
    color: var(--color-text-muted);
  }

  .type-select button.active {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: var(--color-primary-contrast);
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

  .nav {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .nav > button:first-child,
  .nav > button:last-child {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    min-height: 40px;
    width: 40px;
    font-size: 1.1rem;
  }

  .nav-label {
    flex: 1;
    background: transparent;
    border: none;
    font-weight: 700;
    font-size: 1.05rem;
    text-align: center;
    min-height: auto;
  }

  .summary {
    margin: 0;
    font-size: 0.85rem;
    color: var(--color-text-muted);
    text-align: center;
  }

  .hint,
  .empty {
    color: var(--color-text-muted);
    text-align: center;
    margin-top: var(--space-4);
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
    align-items: center;
    gap: var(--space-3);
    min-height: auto;
  }

  .row-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-primary);
  }

  .row-text {
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
  }

  .delete {
    background: transparent;
    border: none;
    color: var(--color-danger);
    padding: 0 var(--space-3);
    min-height: auto;
    font-size: 1.1rem;
  }
</style>
