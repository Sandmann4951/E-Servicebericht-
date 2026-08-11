<script lang="ts">
  import { createReport, deleteReport, getReport, updateReport } from '../lib/db/reports';
  import type { ReportStatus } from '../lib/db/types';
  import { navigate } from '../lib/router.svelte';
  import { debounce } from '../lib/utils/debounce';
  import { formatDurationMinutes } from '../lib/utils/date';
  import TimeEntrySection from '../lib/components/TimeEntrySection.svelte';
  import MaterialSection from '../lib/components/MaterialSection.svelte';
  import PhotoSection from '../lib/components/PhotoSection.svelte';

  let { id }: { id: string } = $props();

  // `id` wird bewusst nur beim Mount gelesen: App.svelte rendert diesen
  // Screen innerhalb eines {#key route.id}-Blocks, der bei Routenwechsel
  // ohnehin eine frische Komponenteninstanz erzeugt.
  const isNewRoute = $derived(id === 'new');

  let reportId = $state<string | undefined>(undefined);
  let loading = $state(!isNewRoute);
  let notFound = $state(false);

  let projectNumber = $state('');
  let customer = $state('');
  let technicianName = $state('');
  let notes = $state('');
  let status = $state<ReportStatus>('open');

  let timeEntryCount = $state(0);
  let totalDurationMinutes = $state(0);
  let materialItemCount = $state(0);
  let photoCount = $state(0);

  let activeTab = $state<'übersicht' | 'zeiten' | 'material' | 'fotos'>('übersicht');
  let savedPulseVisible = $state(false);
  let savedPulseTimeout: ReturnType<typeof setTimeout> | undefined;
  let projectNumberMissing = $state(false);
  let exporting = $state(false);
  let exportError = $state(false);

  function flashSaved(): void {
    savedPulseVisible = true;
    if (savedPulseTimeout) clearTimeout(savedPulseTimeout);
    savedPulseTimeout = setTimeout(() => (savedPulseVisible = false), 1500);
  }

  async function persistNow(): Promise<void> {
    if (!reportId) {
      if (!projectNumber.trim()) return;
      const created = await createReport({
        projectNumber,
        customer: customer || undefined,
        technicianName: technicianName || undefined
      });
      reportId = created.id;
      navigate(`/reports/${created.id}`, { replace: true });
      flashSaved();
      return;
    }
    const updated = await updateReport(reportId, {
      projectNumber,
      customer: customer || undefined,
      technicianName: technicianName || undefined,
      notes: notes || undefined,
      status
    });
    if (updated) flashSaved();
  }

  const scheduledSave = debounce(() => {
    void persistNow();
  }, 450);

  function onFieldChange(): void {
    projectNumberMissing = false;
    scheduledSave.run();
  }

  function flushNow(): void {
    scheduledSave.flush();
  }

  $effect(() => {
    if (isNewRoute) return;
    let cancelled = false;
    loading = true;
    getReport(id).then((report) => {
      if (cancelled) return;
      if (!report) {
        notFound = true;
        loading = false;
        return;
      }
      reportId = report.id;
      projectNumber = report.projectNumber;
      customer = report.customer ?? '';
      technicianName = report.technicianName ?? '';
      notes = report.notes ?? '';
      status = report.status;
      timeEntryCount = report.timeEntryCount;
      totalDurationMinutes = report.totalDurationMinutes;
      materialItemCount = report.materialItemCount;
      photoCount = report.photoCount;
      loading = false;
    });
    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    function handleVisibilityChange(): void {
      if (document.visibilityState === 'hidden') flushNow();
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', flushNow);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', flushNow);
      flushNow();
    };
  });

  async function refreshSummary(): Promise<void> {
    if (!reportId) return;
    const report = await getReport(reportId);
    if (!report) return;
    timeEntryCount = report.timeEntryCount;
    totalDurationMinutes = report.totalDurationMinutes;
    materialItemCount = report.materialItemCount;
    photoCount = report.photoCount;
  }

  async function toggleStatus(): Promise<void> {
    status = status === 'open' ? 'completed' : 'open';
    flushNow();
    await persistNow();
  }

  async function removeReport(): Promise<void> {
    if (!reportId) {
      navigate('/', { replace: true });
      return;
    }
    if (!confirm('Diesen Servicebericht inkl. aller Zeiten, Material und Fotos endgültig löschen?')) return;
    await deleteReport(reportId);
    navigate('/', { replace: true });
  }

  async function exportReport(): Promise<void> {
    if (!reportId || exporting) return;
    exporting = true;
    exportError = false;
    try {
      const [{ getFullReport }, { buildReportDocx, suggestedFileName }] = await Promise.all([
        import('../lib/export/getFullReport'),
        import('../lib/export/docxExport')
      ]);
      const data = await getFullReport(reportId);
      if (!data) return;

      const blob = await buildReportDocx(data);
      const fileName = suggestedFileName(data.report);
      const mimeType = blob.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      const file = new File([blob], fileName, { type: mimeType });

      // Auf dem iPhone spürbar besserer Workflow: direkt aus dem Share-Sheet
      // per Mail/WhatsApp/AirDrop verschicken, statt erst in Dateien suchen zu
      // müssen. Fallback auf klassischen Download, wenn nicht unterstützt.
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName });
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      // Ein vom Nutzer abgebrochener Share-Dialog ist kein Fehler.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      exportError = true;
      console.error('Export fehlgeschlagen', err);
    } finally {
      exporting = false;
    }
  }

  function back(): void {
    if (!reportId && !projectNumber.trim()) {
      // Reiner Entwurf ohne Projektnummer - nichts zu speichern, einfach zurück.
      navigate('/');
      return;
    }
    flushNow();
    navigate('/');
  }

  function openSectionTab(tab: 'zeiten' | 'material' | 'fotos'): void {
    if (!reportId) {
      projectNumberMissing = true;
      return;
    }
    activeTab = tab;
  }
</script>

<div class="screen">
  <header class="header">
    <button type="button" class="back" onclick={back} aria-label="Zurück zur Liste">←</button>
    <h1>{isNewRoute && !reportId ? 'Neuer Bericht' : 'Servicebericht'}</h1>
    {#if savedPulseVisible}
      <span class="saved">✓ Gespeichert</span>
    {/if}
    {#if reportId}
      <button
        type="button"
        class="export-report"
        onclick={exportReport}
        disabled={exporting}
        aria-label="Als Word-Dokument exportieren"
      >
        {exporting ? '…' : '⬇️'}
      </button>
      <button type="button" class="delete-report" onclick={removeReport} aria-label="Bericht löschen">🗑</button>
    {/if}
  </header>
  {#if exportError}
    <p class="export-error">Export fehlgeschlagen. Bitte erneut versuchen.</p>
  {/if}

  {#if loading}
    <p class="hint">Lade Bericht…</p>
  {:else if notFound}
    <div class="empty">
      <p>Dieser Bericht wurde nicht gefunden.</p>
      <button type="button" class="primary" onclick={() => navigate('/', { replace: true })}>Zur Übersicht</button>
    </div>
  {:else}
    <div class="content">
      <div class="fields">
        <label class:invalid={projectNumberMissing}>
          Projektnummer *
          <input
            type="text"
            bind:value={projectNumber}
            oninput={onFieldChange}
            onblur={flushNow}
            placeholder="z.B. 2026-0142"
            required
          />
        </label>
        {#if projectNumberMissing}
          <p class="field-hint">Bitte zuerst eine Projektnummer eingeben.</p>
        {/if}

        <label>
          Kunde
          <input type="text" bind:value={customer} oninput={onFieldChange} onblur={flushNow} placeholder="Firma / Ansprechpartner" />
        </label>

        <label>
          Techniker
          <input type="text" bind:value={technicianName} oninput={onFieldChange} onblur={flushNow} placeholder="Dein Name" />
        </label>

        <button type="button" class="status-toggle" class:completed={status === 'completed'} onclick={toggleStatus}>
          {status === 'open' ? '● Offen' : '✓ Abgeschlossen'}
        </button>
      </div>

      <div class="tabs" role="tablist" aria-label="Bereich wählen">
        <button type="button" class:active={activeTab === 'übersicht'} onclick={() => (activeTab = 'übersicht')}>
          Übersicht
        </button>
        <button type="button" class:active={activeTab === 'zeiten'} onclick={() => openSectionTab('zeiten')}>
          Zeiten
        </button>
        <button type="button" class:active={activeTab === 'material'} onclick={() => openSectionTab('material')}>
          Material
        </button>
        <button type="button" class:active={activeTab === 'fotos'} onclick={() => openSectionTab('fotos')}>
          Fotos
        </button>
      </div>

      <div class="tab-content">
        {#if activeTab === 'übersicht'}
          <div class="overview">
            <div class="stats">
              <div class="stat"><strong>{timeEntryCount}</strong><span>Tage</span></div>
              <div class="stat"><strong>{formatDurationMinutes(totalDurationMinutes)}</strong><span>Zeit gesamt</span></div>
              <div class="stat"><strong>{materialItemCount}</strong><span>Material-Positionen</span></div>
              <div class="stat"><strong>{photoCount}</strong><span>Fotos</span></div>
            </div>
            <label>
              Notizen
              <textarea
                rows="5"
                bind:value={notes}
                oninput={onFieldChange}
                onblur={flushNow}
                placeholder="Allgemeine Notizen zum Einsatz…"
              ></textarea>
            </label>
          </div>
        {:else if activeTab === 'zeiten' && reportId}
          <TimeEntrySection {reportId} onChanged={refreshSummary} />
        {:else if activeTab === 'material' && reportId}
          <MaterialSection {reportId} onChanged={refreshSummary} />
        {:else if activeTab === 'fotos' && reportId}
          <PhotoSection {reportId} onChanged={refreshSummary} />
        {/if}
      </div>
    </div>
  {/if}
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

  .back,
  .export-report,
  .delete-report {
    background: transparent;
    border: none;
    font-size: 1.2rem;
    padding: var(--space-2);
    min-height: auto;
  }

  .export-report:disabled {
    opacity: 0.5;
  }

  .delete-report {
    color: var(--color-danger);
  }

  .saved {
    font-size: 0.8rem;
    color: var(--color-success);
    font-weight: 600;
    white-space: nowrap;
  }

  .export-error {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    color: var(--color-danger);
    font-size: 0.85rem;
    text-align: center;
  }

  .hint {
    color: var(--color-text-muted);
    text-align: center;
    margin-top: var(--space-6);
  }

  .empty {
    text-align: center;
    margin-top: var(--space-6);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    align-items: center;
  }

  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
  }

  .fields {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
  }

  .fields label {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }

  .fields label.invalid input {
    border-color: var(--color-danger);
  }

  .field-hint {
    margin: calc(var(--space-2) * -1) 0 0;
    font-size: 0.8rem;
    color: var(--color-danger);
  }

  .status-toggle {
    align-self: flex-start;
    background: var(--color-open-bg);
    color: var(--color-open);
    border: none;
    border-radius: 999px;
    padding: var(--space-2) var(--space-4);
    font-weight: 600;
    min-height: auto;
  }

  .status-toggle.completed {
    background: var(--color-completed-bg);
    color: var(--color-completed);
  }

  .tabs {
    display: flex;
    border-bottom: 1px solid var(--color-border);
    padding: 0 var(--space-2);
    overflow-x: auto;
  }

  .tabs button {
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    padding: var(--space-3) var(--space-3);
    color: var(--color-text-muted);
    font-weight: 600;
    min-height: auto;
    white-space: nowrap;
  }

  .tabs button.active {
    color: var(--color-primary);
    border-bottom-color: var(--color-primary);
  }

  .tab-content {
    padding: var(--space-4);
    padding-bottom: calc(var(--space-6) + var(--safe-bottom));
  }

  .overview {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-3);
  }

  .stat {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .stat strong {
    font-size: 1.2rem;
  }

  .stat span {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .overview label {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }

  .primary {
    background: var(--color-primary);
    color: var(--color-primary-contrast);
    border: none;
    border-radius: var(--radius-sm);
    padding: var(--space-3) var(--space-5);
    font-weight: 600;
  }
</style>
