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
  // "Bis" - standardmäßig gleich "Von" (Einzeltag). Sobald es davon abweicht,
  // legt save() für jeden Tag im Zeitraum einen eigenen Eintrag an (siehe
  // enumerateDates()) - eine mehrtägige Abwesenheit bleibt also weiterhin
  // N einzelne Datensätze, nur die Eingabe ist ein einziger Zeitraum.
  let formEndDate = $state(today);
  let formType = $state<AbsenceType>('vacation');
  let formNote = $state('');
  // Ist ein Eintrag für formDate schon vorhanden, wird er beim Speichern
  // automatisch überschrieben (siehe setAbsence()/Upsert-Kommentar in
  // absences.ts) - editingDate merkt sich nur, ob es sich um eine
  // Bearbeitung eines bereits existierenden Tages handelt (fürs Löschen-Icon
  // im Formular, rein kosmetisch). Nur für Einzeltag-Bearbeitung relevant -
  // bei einem Zeitraum (formDate !== formEndDate) ist es immer undefined.
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
    formEndDate = today;
    formType = 'vacation';
    formNote = '';
    editingDate = undefined;
  }

  function startEdit(absence: Absence): void {
    editingDate = absence.date;
    formDate = absence.date;
    formEndDate = absence.date;
    formType = absence.type;
    formNote = absence.note ?? '';
  }

  /** Alle Tage von start bis end (inklusive), als "YYYY-MM-DD"-Strings. Leer, falls end vor start liegt. */
  function enumerateDates(start: string, end: string): string[] {
    const [sy, sm, sd] = start.split('-').map(Number);
    const [ey, em, ed] = end.split('-').map(Number);
    const startDate = new Date(sy, sm - 1, sd);
    const endDate = new Date(ey, em - 1, ed);
    const dates: string[] = [];
    const cursor = new Date(startDate);
    while (cursor.getTime() <= endDate.getTime()) {
      dates.push(
        `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
      );
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }

  const formDates = $derived.by(() => (formDate && formEndDate ? enumerateDates(formDate, formEndDate) : []));

  async function save(): Promise<void> {
    if (formDates.length === 0 || saving) return;
    saving = true;
    try {
      // War an einem der Tage im Zeitraum schon Arbeitszeit erfasst (Projekt-
      // oder Leerlaufzeit über die Tagesstempeluhr), lieber einmal
      // nachfragen - ein rückwirkend als Urlaub/Krank eingetragener Tag mit
      // bereits erfassten Zeiten ist meist ein Versehen, soll aber nicht
      // blockiert werden (z.B. nachträgliche Korrektur ist durchaus gewollt).
      const daysWithTime: string[] = [];
      for (const date of formDates) {
        const entries = await listTimeEntriesForDate(date);
        if (entries.length > 0) daysWithTime.push(date);
      }
      if (daysWithTime.length > 0) {
        const label = daysWithTime.length <= 5 ? daysWithTime.map(formatDateDE).join(', ') : `${daysWithTime.length} Tagen`;
        const proceed = confirm(
          `Für ${label} ${daysWithTime.length === 1 ? 'ist' : 'sind'} bereits Zeiten erfasst.\n\nTrotzdem als „${TYPE_LABELS[formType]}" eintragen?`
        );
        if (!proceed) return;
      }

      for (const date of formDates) {
        await setAbsence(date, formType, formNote);
      }
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
    if (!formDate) return;
    if (formEndDate < formDate) formEndDate = formDate;
    // Nur bei einem einzelnen Tag (Von = Bis) ergibt eine Auto-Befüllung
    // Sinn - bei einem Zeitraum könnten mehrere unterschiedliche Einträge
    // betroffen sein, da lässt sich kein einzelner sinnvoll vorausfüllen.
    if (formEndDate !== formDate) return;
    // Prüfen, ob für diesen Tag schon eine Abwesenheit existiert, und das
    // Formular direkt damit befüllen - sonst würde ein Speichern hier den
    // bestehenden Eintrag stillschweigend überschreiben (Upsert-Verhalten
    // von setAbsence()), ohne dass sichtbar war, dass da schon etwas stand.
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

  function onFormEndDateChange(): void {
    if (formEndDate < formDate) formEndDate = formDate;
    // Sobald "Bis" vom "Von"-Datum abweicht, ist es kein Einzeltag-Edit mehr.
    if (formEndDate !== formDate && editingDate !== undefined) {
      editingDate = undefined;
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
      <div class="two-col">
        <label>
          Von
          <input type="date" bind:value={formDate} onchange={onFormDateChange} required />
        </label>
        <label>
          Bis
          <input type="date" bind:value={formEndDate} min={formDate} onchange={onFormEndDateChange} required />
        </label>
      </div>

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
        <button type="submit" class="primary" disabled={saving || formDates.length === 0}>
          {editingDate ? 'Aktualisieren' : formDates.length > 1 ? `${formDates.length} Tage eintragen` : 'Eintragen'}
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

  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
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
