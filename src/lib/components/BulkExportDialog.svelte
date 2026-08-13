<script lang="ts">
  import {
    bulkExportReports,
    listUnexportedReportsInRange,
    resolvePeriodRange,
    type BulkExportProgress,
    type BulkExportResult,
    type ExportPeriod,
    type PeriodRange
  } from '../export/bulkExport';
  import type { ServiceReport } from '../db/types';
  import { formatDateDE, todayISODate } from '../utils/date';
  import Icon from './Icon.svelte';

  let { onClose, onExported }: { onClose: () => void; onExported: () => void } = $props();

  type Step = 'scope' | 'period' | 'custom-range' | 'confirm' | 'exporting' | 'done';

  let step = $state<Step>('scope');
  let period = $state<ExportPeriod>('all');
  let customStart = $state(todayISODate());
  let customEnd = $state(todayISODate());
  let range = $state<PeriodRange>({});

  let loadingCount = $state(false);
  let matches = $state<ServiceReport[]>([]);
  let progress = $state<BulkExportProgress | undefined>(undefined);
  let result = $state<BulkExportResult | undefined>(undefined);
  let error = $state('');

  async function chooseAll(): Promise<void> {
    period = 'all';
    await loadMatches({});
  }

  function choosePeriodStep(): void {
    step = 'period';
  }

  async function choosePeriod(p: ExportPeriod): Promise<void> {
    period = p;
    await loadMatches(resolvePeriodRange(p));
  }

  function chooseCustom(): void {
    step = 'custom-range';
  }

  async function confirmCustomRange(): Promise<void> {
    period = 'custom';
    await loadMatches(resolvePeriodRange('custom', { start: customStart, end: customEnd || undefined }));
  }

  async function loadMatches(r: PeriodRange): Promise<void> {
    range = r;
    step = 'confirm';
    loadingCount = true;
    error = '';
    try {
      matches = await listUnexportedReportsInRange(r);
    } catch (err) {
      error = 'Berichte konnten nicht geladen werden. Bitte erneut versuchen.';
      console.error('Sammelexport: Laden fehlgeschlagen', err);
    } finally {
      loadingCount = false;
    }
  }

  function back(): void {
    if (step === 'confirm') {
      step = period === 'all' ? 'scope' : period === 'custom' ? 'custom-range' : 'period';
      return;
    }
    if (step === 'custom-range') {
      step = 'period';
      return;
    }
    step = 'scope';
  }

  async function runExport(): Promise<void> {
    step = 'exporting';
    progress = { done: 0, total: matches.length };
    error = '';
    try {
      const exportResult = await bulkExportReports(matches, (p) => (progress = p));
      if (exportResult.aborted) {
        // Nutzer hat das Teilen-Sheet abgebrochen - kein Fehler, einfach
        // zurück zur Bestätigung, ohne irgendetwas als exportiert zu markieren.
        step = 'confirm';
        return;
      }
      result = exportResult;
      step = 'done';
      if (exportResult.exportedCount > 0) onExported();
    } catch (err) {
      error = 'Export fehlgeschlagen. Bitte erneut versuchen.';
      console.error('Sammelexport fehlgeschlagen', err);
      step = 'confirm';
    }
  }

  function periodLabel(): string {
    switch (period) {
      case 'today':
        return 'heute';
      case 'week':
        return 'diese Woche';
      case 'month':
        return 'diesen Monat';
      case 'custom':
        return range.start && range.end
          ? `${formatDateDE(range.start)} – ${formatDateDE(range.end)}`
          : 'den gewählten Zeitraum';
      case 'all':
      default:
        return 'den gesamten Zeitraum';
    }
  }
</script>

<div class="overlay" role="dialog" aria-modal="true" aria-label="Alle nicht exportierten Berichte exportieren">
  <div class="dialog">
    <div class="dialog-header">
      <h2>Sammelexport</h2>
      {#if step !== 'exporting'}
        <button type="button" class="close" onclick={onClose} aria-label="Schließen"><Icon name="close" size={18} /></button>
      {/if}
    </div>

    {#if step === 'scope'}
      <p class="hint">Welcher Zeitraum soll auf noch nicht exportierte Berichte geprüft werden?</p>
      <div class="option-list">
        <button type="button" class="option" onclick={chooseAll}>
          <strong>Gesamter Zeitraum</strong>
          <span>Alle jemals noch nicht exportierten Berichte</span>
        </button>
        <button type="button" class="option" onclick={choosePeriodStep}>
          <strong>Bestimmter Zeitraum</strong>
          <span>Heute, diese Woche, dieser Monat oder individuell</span>
        </button>
      </div>
    {:else if step === 'period'}
      <p class="hint">Welcher Zeitraum?</p>
      <div class="option-list">
        <button type="button" class="option" onclick={() => choosePeriod('today')}>
          <strong>Heute</strong>
        </button>
        <button type="button" class="option" onclick={() => choosePeriod('week')}>
          <strong>Diese Woche</strong>
        </button>
        <button type="button" class="option" onclick={() => choosePeriod('month')}>
          <strong>Dieser Monat</strong>
        </button>
        <button type="button" class="option" onclick={chooseCustom}>
          <strong>Individueller Zeitraum</strong>
        </button>
      </div>
      <button type="button" class="ghost back" onclick={back}>Zurück</button>
    {:else if step === 'custom-range'}
      <p class="hint">Individueller Zeitraum</p>
      <label>
        Von
        <input type="date" bind:value={customStart} max={customEnd || undefined} />
      </label>
      <label>
        Bis
        <input type="date" bind:value={customEnd} min={customStart || undefined} />
      </label>
      <div class="actions">
        <button type="button" class="ghost" onclick={back}>Zurück</button>
        <button type="button" class="primary" onclick={confirmCustomRange} disabled={!customStart}>Weiter</button>
      </div>
    {:else if step === 'confirm'}
      {#if loadingCount}
        <p class="hint">Suche Berichte…</p>
      {:else if error}
        <p class="error">{error}</p>
        <button type="button" class="ghost back" onclick={back}>Zurück</button>
      {:else if matches.length === 0}
        <p class="hint">Keine noch nicht exportierten Berichte für {periodLabel()} gefunden.</p>
        <div class="actions">
          <button type="button" class="ghost" onclick={back}>Zurück</button>
          <button type="button" class="primary" onclick={onClose}>Schließen</button>
        </div>
      {:else}
        <p class="count">
          <strong>{matches.length}</strong>
          {matches.length === 1 ? 'Bericht' : 'Berichte'} für {periodLabel()} gefunden.
        </p>
        <ul class="preview">
          {#each matches as report (report.id)}
            <li>{report.projectNumber || 'Ohne Projektnummer'}{#if report.customer} · {report.customer}{/if}</li>
          {/each}
        </ul>
        <p class="hint">Wirklich {matches.length === 1 ? 'diesen Bericht' : 'diese Berichte'} jetzt exportieren?</p>
        <div class="actions">
          <button type="button" class="ghost" onclick={back}>Zurück</button>
          <button type="button" class="primary" onclick={runExport}>
            {matches.length} {matches.length === 1 ? 'Bericht' : 'Berichte'} exportieren
          </button>
        </div>
      {/if}
    {:else if step === 'exporting'}
      <p class="hint">
        Erstelle Dokument {progress?.done ?? 0} von {progress?.total ?? matches.length}…
      </p>
      <div class="progress-bar">
        <div class="progress-fill" style:width="{((progress?.done ?? 0) / (progress?.total || 1)) * 100}%"></div>
      </div>
    {:else if step === 'done' && result}
      {#if result.failed.length === 0}
        <p class="count">
          <Icon name="check-circle" size={20} />
          {result.exportedCount} {result.exportedCount === 1 ? 'Bericht' : 'Berichte'} erfolgreich exportiert.
        </p>
      {:else}
        <p class="count">
          {result.exportedCount} von {result.exportedCount + result.failed.length} Berichten exportiert.
        </p>
        <p class="error">
          Fehlgeschlagen: {result.failed.map((r) => r.projectNumber || 'Ohne Projektnummer').join(', ')}
        </p>
      {/if}
      <div class="actions">
        <button type="button" class="primary" onclick={onClose}>Schließen</button>
      </div>
    {/if}
  </div>
</div>

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
    max-width: 420px;
    max-height: calc(100dvh - var(--space-6));
    overflow-y: auto;
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    box-shadow: 0 20px 48px var(--color-shadow);
  }

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .dialog-header h2 {
    margin: 0;
  }

  .close {
    background: transparent;
    border: none;
    color: var(--color-text-muted);
    padding: var(--space-1);
    min-height: auto;
  }

  .hint {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 0.9rem;
  }

  .error {
    margin: 0;
    color: var(--color-danger);
    font-size: 0.9rem;
  }

  .count {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-weight: 600;
  }

  .option-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .option {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    text-align: left;
    background: var(--color-surface-muted);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-3) var(--space-4);
  }

  .option span {
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  .dialog label {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }

  .preview {
    margin: 0;
    padding: 0 0 0 var(--space-4);
    max-height: 160px;
    overflow-y: auto;
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }

  .preview li {
    margin-bottom: 2px;
  }

  .progress-bar {
    height: 8px;
    border-radius: 999px;
    background: var(--color-surface-muted);
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--color-primary);
    transition: width 0.2s ease;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .back {
    align-self: flex-start;
  }

  .ghost {
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-4);
    min-height: auto;
    color: var(--color-text);
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

  .primary:disabled {
    opacity: 0.5;
  }
</style>
