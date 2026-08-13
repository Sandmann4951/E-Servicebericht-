<script lang="ts">
  import { navigate } from '../lib/router.svelte';
  import Icon from '../lib/components/Icon.svelte';
  import {
    getBundesland,
    getTechnicianName,
    getWeeklyTargetHours,
    setBundesland,
    setTechnicianName,
    setWeeklyTargetHours
  } from '../lib/settings';
  import { BUNDESLAENDER, type Bundesland } from '../lib/utils/holidays';

  // Autosave wie im Rest der App - kein eigener Speichern-Button, jede
  // Änderung landet sofort in localStorage (siehe settings.ts).
  let technicianName = $state(getTechnicianName());
  let weeklyTargetHoursInput = $state(String(getWeeklyTargetHours()));
  let bundesland = $state<Bundesland | ''>(getBundesland() ?? '');

  function onTechnicianNameChange(): void {
    setTechnicianName(technicianName);
  }

  function onWeeklyTargetHoursChange(): void {
    // bind:value auf einem input[type=number] liefert zur Laufzeit trotz des
    // string-Typs oben ein echtes number (Svelte koerziert automatisch) -
    // String(...) fängt das ab, .replace() bräuchte sonst zwingend einen
    // String (z.B. bei manuell mit Komma eingetipptem Dezimaltrenner).
    const parsed = Number(String(weeklyTargetHoursInput).replace(',', '.'));
    setWeeklyTargetHours(parsed);
    // Nach dem Speichern den tatsächlich übernommenen (validierten) Wert
    // zurückspiegeln, z.B. falls ein ungültiger Wert auf den Standard fiel.
    weeklyTargetHoursInput = String(getWeeklyTargetHours());
  }

  function onBundeslandChange(): void {
    setBundesland(bundesland || undefined);
  }
</script>

<div class="screen">
  <header class="header">
    <button type="button" class="back" onclick={() => navigate('/')} aria-label="Zurück zur Übersicht">
      <Icon name="back" />
    </button>
    <h1>Einstellungen</h1>
  </header>

  <div class="content">
    <section class="group">
      <h2>Techniker</h2>
      <label>
        Name
        <input
          type="text"
          bind:value={technicianName}
          onblur={onTechnicianNameChange}
          placeholder="Dein Name"
        />
      </label>
      <p class="hint">Wird bei neuen Berichten automatisch als Techniker vorausgefüllt.</p>
    </section>

    <section class="group">
      <h2>Arbeitszeit</h2>
      <label>
        Sollstunden pro Woche
        <input
          type="number"
          inputmode="decimal"
          min="0"
          step="0.5"
          bind:value={weeklyTargetHoursInput}
          onblur={onWeeklyTargetHoursChange}
        />
      </label>
      <p class="hint">
        Grundlage für den Soll-/Ist-Stunden-Vergleich in der Monats-Statistik (angenommen: 5-Tage-Woche, Sollstunden
        pro Tag = Wochenwert ÷ 5).
      </p>

      <label>
        Bundesland
        <select bind:value={bundesland} onchange={onBundeslandChange}>
          <option value="">Nicht ausgewählt</option>
          {#each BUNDESLAENDER as land (land.code)}
            <option value={land.code}>{land.label}</option>
          {/each}
        </select>
      </label>
      <p class="hint">
        Für die korrekte Berücksichtigung landesspezifischer Feiertage (z.B. Fronleichnam, Allerheiligen) im
        Soll-/Ist-Vergleich. Ohne Auswahl zählen nur die neun bundesweiten Feiertage.
      </p>
    </section>
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
    gap: var(--space-5);
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-4);
  }

  .group h2 {
    margin: 0;
    font-size: 1rem;
  }

  .group label {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }

  .hint {
    margin: calc(-1 * var(--space-2)) 0 0;
    font-size: 0.78rem;
    color: var(--color-text-muted);
    line-height: 1.4;
  }
</style>
