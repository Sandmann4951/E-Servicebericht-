<script lang="ts">
  import { addMaterialItem, deleteMaterialItem, listMaterialItems, updateMaterialItem } from '../db/materialItems';
  import type { MaterialItem } from '../db/types';
  import { STANDARD_MATERIALS } from '../materialCatalog';
  import Icon from './Icon.svelte';

  let { reportId, locked = false, onChanged }: { reportId: string; locked?: boolean; onChanged: () => void } = $props();

  const commonUnits = ['Stk', 'm', 'Set', 'Std', 'kg', 'lfm', 'Pkg'];
  const unitByDescription = new Map(STANDARD_MATERIALS.map((entry) => [entry.description, entry.unit]));
  let descriptionOptions = $state<string[]>(STANDARD_MATERIALS.map((entry) => entry.description));
  let unitTouched = $state(false);

  let items = $state<MaterialItem[]>([]);
  let loading = $state(true);
  let showForm = $state(false);
  let editingId = $state<string | undefined>();

  let formDescription = $state('');
  let formQuantity = $state('1');
  let formUnit = $state('Stk');
  let formArticleNumber = $state('');

  async function load(): Promise<void> {
    loading = true;
    items = await listMaterialItems(reportId);
    loading = false;
    // Vorschlagsliste wächst um bereits in diesem Bericht verwendete
    // Bezeichnungen, zusätzlich zum Standard-Materialstamm (dedupliziert).
    const used = items.map((item) => item.description);
    descriptionOptions = [...new Set([...STANDARD_MATERIALS.map((entry) => entry.description), ...used])];
  }

  $effect(() => {
    reportId;
    load();
  });

  function resetForm(): void {
    formDescription = '';
    formQuantity = '1';
    formUnit = 'Stk';
    formArticleNumber = '';
    editingId = undefined;
    showForm = false;
    unitTouched = false;
  }

  function startAdd(): void {
    resetForm();
    showForm = true;
  }

  function startEdit(item: MaterialItem): void {
    editingId = item.id;
    formDescription = item.description;
    formQuantity = String(item.quantity);
    formUnit = item.unit;
    formArticleNumber = item.articleNumber ?? '';
    unitTouched = true; // Einheit eines bestehenden Eintrags nicht durch Katalog-Match überschreiben.
    showForm = true;
  }

  /** Übernimmt bei einer Katalog-Bezeichnung automatisch die hinterlegte Einheit, sofern der Nutzer sie noch nicht selbst geändert hat. */
  function onDescriptionInput(): void {
    if (unitTouched) return;
    const suggestedUnit = unitByDescription.get(formDescription.trim());
    if (suggestedUnit) formUnit = suggestedUnit;
  }

  function onUnitInput(): void {
    unitTouched = true;
  }

  async function save(): Promise<void> {
    const description = formDescription.trim();
    const quantity = Number(formQuantity.replace(',', '.'));
    if (!description || !Number.isFinite(quantity) || quantity <= 0) return;

    const payload = { description, quantity, unit: formUnit.trim() || 'Stk', articleNumber: formArticleNumber };
    if (editingId) {
      await updateMaterialItem(editingId, payload);
    } else {
      await addMaterialItem(reportId, payload);
    }
    resetForm();
    await load();
    onChanged();
  }

  async function remove(item: MaterialItem): Promise<void> {
    if (!confirm('Diese Materialposition löschen?')) return;
    await deleteMaterialItem(item.id);
    if (editingId === item.id) resetForm();
    await load();
    onChanged();
  }
</script>

<div class="section">
  {#if loading}
    <p class="hint">Lade Material…</p>
  {:else}
    {#if items.length === 0 && !showForm}
      <p class="hint">Noch kein Material erfasst.</p>
    {/if}
    {#if items.length > 0}
      <ul class="list">
        {#each items as item (item.id)}
          <li class="row">
            {#if locked}
              <div class="row-main">
                <span class="desc">{item.description}</span>
                <span class="meta">
                  {item.quantity} {item.unit}{item.articleNumber ? ` · Art.-Nr. ${item.articleNumber}` : ''}
                </span>
              </div>
            {:else}
              <button type="button" class="row-main" onclick={() => startEdit(item)}>
                <span class="desc">{item.description}</span>
                <span class="meta">
                  {item.quantity} {item.unit}{item.articleNumber ? ` · Art.-Nr. ${item.articleNumber}` : ''}
                </span>
              </button>
              <button type="button" class="delete" aria-label="Position löschen" onclick={() => remove(item)}>
                <Icon name="trash" />
              </button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  {/if}

  {#if locked}
    <p class="hint">Bericht ist gesperrt – Material kann nicht mehr geändert werden.</p>
  {:else if showForm}
    <form
      class="form"
      onsubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label>
        Bezeichnung
        <input
          type="text"
          list="description-options"
          bind:value={formDescription}
          oninput={onDescriptionInput}
          placeholder="z.B. Kabel NYM-J 3x1,5"
          required
        />
        <datalist id="description-options">
          {#each descriptionOptions as description (description)}
            <option value={description}></option>
          {/each}
        </datalist>
      </label>
      <div class="two-col">
        <label>
          Menge
          <input type="text" inputmode="decimal" bind:value={formQuantity} />
        </label>
        <label>
          Einheit
          <input type="text" list="unit-options" bind:value={formUnit} oninput={onUnitInput} />
          <datalist id="unit-options">
            {#each commonUnits as unit (unit)}
              <option value={unit}></option>
            {/each}
          </datalist>
        </label>
      </div>
      <label>
        Artikelnummer (optional)
        <input type="text" bind:value={formArticleNumber} />
      </label>
      <div class="form-actions">
        <button type="button" class="ghost" onclick={resetForm}>Abbrechen</button>
        <button type="submit" class="primary">Speichern</button>
      </div>
    </form>
  {:else}
    <button type="button" class="add" onclick={startAdd}>+ Position hinzufügen</button>
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

  .desc {
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
