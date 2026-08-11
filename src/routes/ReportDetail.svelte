<script lang="ts">
  import { clearReportSignature, createReport, deleteReport, getReport, setReportSignature, updateReport } from '../lib/db/reports';
  import { getActiveTimeEntry, updateTimeEntry } from '../lib/db/timeEntries';
  import type { ReportStatus } from '../lib/db/types';
  import { navigate } from '../lib/router.svelte';
  import { debounce } from '../lib/utils/debounce';
  import { formatDurationMinutes, nowHHmm } from '../lib/utils/date';
  import TimeClock from '../lib/components/TimeClock.svelte';
  import TimeEntrySection from '../lib/components/TimeEntrySection.svelte';
  import MaterialSection from '../lib/components/MaterialSection.svelte';
  import PhotoSection from '../lib/components/PhotoSection.svelte';
  import SignatureSection from '../lib/components/SignatureSection.svelte';

  let { id }: { id: string } = $props();

  // `id` wird bewusst nur beim Mount gelesen: App.svelte rendert diesen
  // Screen innerhalb eines {#key route.id}-Blocks, der bei Routenwechsel
  // ohnehin eine frische Komponenteninstanz erzeugt.
  const isNewRoute = $derived(id === 'new');

  let reportId = $state<string | undefined>(undefined);
  let loading = $state(!isNewRoute);
  let notFound = $state(false);

  let projectNumber = $state('');
  let projectDescription = $state('');
  let customer = $state('');
  let contactPerson = $state('');
  let technicianName = $state('');
  let notes = $state('');
  let status = $state<ReportStatus>('open');

  let timeEntryCount = $state(0);
  let totalDurationMinutes = $state(0);
  let materialItemCount = $state(0);
  let photoCount = $state(0);

  let signatureBlob = $state<Blob | undefined>(undefined);
  let signedByName = $state<string | undefined>(undefined);
  let signedAt = $state<string | undefined>(undefined);

  // Ein unterschriebener Bericht gilt als abgeschlossen und darf nicht mehr
  // verändert werden - die Sperre hängt bewusst direkt an signedAt statt an
  // einem eigenen Flag, damit sie nie aus dem Tritt geraten kann. Einziger
  // Weg zurück: die Unterschrift über SignatureSection wieder entfernen.
  const locked = $derived(!!signedAt);

  let activeTab = $state<'übersicht' | 'zeiten' | 'material' | 'fotos' | 'unterschrift'>('übersicht');
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
        projectDescription: projectDescription || undefined,
        customer: customer || undefined,
        contactPerson: contactPerson || undefined,
        technicianName: technicianName || undefined,
        notes: notes || undefined
      });
      reportId = created.id;
      // Absichtlich noch KEIN navigate() hier: das würde über
      // {#key route.id} in App.svelte sofort diese Komponente neu mounten
      // und dabei gerade eingetippten, noch ungespeicherten Text in anderen
      // Feldern verwerfen (der Nutzer tippt beim Anlegen oft mehrere Felder
      // kurz hintereinander aus). Die URL wird stattdessen erst an
      // unkritischen Stellen synchronisiert, siehe syncUrlToReportId().
    }
    const id = reportId;
    if (!id) return;
    // Direkt nach dem Anlegen mit dem aktuellen Stand aktualisieren, statt
    // hier aufzuhören - falls seit dem Lesen der Felder oben weitergetippt
    // wurde, landet der neueste Stand so trotzdem sofort in der DB.
    const updated = await updateReport(id, {
      projectNumber,
      projectDescription: projectDescription || undefined,
      customer: customer || undefined,
      contactPerson: contactPerson || undefined,
      technicianName: technicianName || undefined,
      notes: notes || undefined,
      status
    });
    if (updated) flashSaved();
  }

  // persistNow() liest reaktiven State und macht dann einen Lesen-Ändern-
  // Schreiben-Zyklus auf der DB. Bei schnell aufeinanderfolgenden Aufrufen
  // (z.B. onblur={flushNow} beim Wechsel zwischen mehreren Feldern kurz
  // hintereinander) dürfen diese Zyklen NIE parallel laufen - sonst kann ein
  // später gestarteter, aber früher abgeschlossener Aufruf einen bereits
  // gespeicherten Feldwert wieder überschreiben. saveChain serialisiert alle
  // Aufrufe strikt in Aufrufreihenfolge.
  let saveChain: Promise<void> = Promise.resolve();

  function queueSave(): Promise<void> {
    saveChain = saveChain.then(persistNow).catch((err) => console.error('Speichern fehlgeschlagen', err));
    return saveChain;
  }

  const scheduledSave = debounce(() => {
    queueSave();
  }, 450);

  function onFieldChange(): void {
    projectNumberMissing = false;
    scheduledSave.run();
  }

  function flushNow(): void {
    scheduledSave.flush();
  }

  /**
   * Trägt die URL von "/reports/new" auf die inzwischen vergebene reportId
   * nach - wichtig für Reload/Zurück-Button, aber bewusst NICHT direkt nach
   * dem Anlegen aufgerufen (siehe persistNow()). Nur an Stellen aufrufen, an
   * denen der Nutzer gerade nicht mitten im Tippen ist (Tab-Wechsel,
   * Hintergrund/Verlassen der Seite) - der {#key route.id}-Remount, den das
   * auslöst, ist an diesen Punkten unkritisch.
   */
  function syncUrlToReportId(): void {
    if (reportId && isNewRoute) {
      navigate(`/reports/${reportId}`, { replace: true });
    }
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
      projectDescription = report.projectDescription ?? '';
      customer = report.customer ?? '';
      contactPerson = report.contactPerson ?? '';
      technicianName = report.technicianName ?? '';
      notes = report.notes ?? '';
      status = report.status;
      timeEntryCount = report.timeEntryCount;
      totalDurationMinutes = report.totalDurationMinutes;
      materialItemCount = report.materialItemCount;
      photoCount = report.photoCount;
      signatureBlob = report.signatureBlob;
      signedByName = report.signedByName;
      signedAt = report.signedAt;
      loading = false;
    });
    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    function handleVisibilityChange(): void {
      if (document.visibilityState === 'hidden') {
        flushNow();
        syncUrlToReportId();
      }
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

  async function saveSignature(blob: Blob, name: string, width: number, height: number): Promise<void> {
    if (!reportId) return;
    const updated = await setReportSignature(reportId, { blob, signedByName: name, width, height });
    if (!updated) return;
    signatureBlob = updated.signatureBlob;
    signedByName = updated.signedByName;
    signedAt = updated.signedAt;
    flashSaved();

    // Unterschreiben sperrt den Bericht (siehe `locked`). Eine noch laufende
    // Stempeluhr in diesem Bericht wird dabei automatisch beendet - sonst
    // bliebe sie offen, ohne dass sie nach der Sperre noch jemand ausstempeln
    // könnte. Der Status springt konsequent auf "Abgeschlossen".
    const activeEntry = await getActiveTimeEntry(reportId);
    if (activeEntry) {
      await updateTimeEntry(activeEntry.id, { endTime: nowHHmm() });
      await refreshSummary();
    }
    if (status !== 'completed') status = 'completed';
    await queueSave();
  }

  async function clearSignature(): Promise<void> {
    if (!reportId) return;
    const updated = await clearReportSignature(reportId);
    if (!updated) return;
    signatureBlob = updated.signatureBlob;
    signedByName = updated.signedByName;
    signedAt = updated.signedAt;
    flashSaved();
  }

  async function toggleStatus(): Promise<void> {
    status = status === 'open' ? 'completed' : 'open';
    // Bewusst NICHT über flushNow(): der Status-Button löst kein
    // oninput={onFieldChange} aus, es gäbe also nichts "Pending" zum
    // Flushen - queueSave() direkt aufzurufen ist hier der korrekte Weg,
    // sonst wird die Änderung nie gespeichert (siehe Regressionstest).
    await queueSave();
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

  function openSectionTab(tab: 'zeiten' | 'material' | 'fotos' | 'unterschrift'): void {
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
      {#if locked}
        <p class="locked-banner">
          🔒 Unterschrieben am {signedAt ? new Date(signedAt).toLocaleString('de-DE') : ''}{signedByName ? ` von ${signedByName}` : ''}
          – der Bericht ist gesperrt. Um Änderungen vorzunehmen, muss die Unterschrift im Tab "Unterschrift" zuerst entfernt werden.
        </p>
      {/if}
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
            disabled={locked}
          />
        </label>
        {#if projectNumberMissing}
          <p class="field-hint">Bitte zuerst eine Projektnummer eingeben.</p>
        {/if}

        <label>
          Kurzbeschreibung
          <input
            type="text"
            bind:value={projectDescription}
            oninput={onFieldChange}
            onblur={flushNow}
            placeholder="z.B. Zählerschrank-Sanierung EG"
            disabled={locked}
          />
        </label>

        <label>
          Kunde
          <input
            type="text"
            bind:value={customer}
            oninput={onFieldChange}
            onblur={flushNow}
            placeholder="Firma"
            disabled={locked}
          />
        </label>

        <label>
          Ansprechpartner (Kunde)
          <input
            type="text"
            bind:value={contactPerson}
            oninput={onFieldChange}
            onblur={flushNow}
            placeholder="Name des Ansprechpartners vor Ort"
            disabled={locked}
          />
        </label>

        <label>
          Techniker
          <input
            type="text"
            bind:value={technicianName}
            oninput={onFieldChange}
            onblur={flushNow}
            placeholder="Dein Name"
            disabled={locked}
          />
        </label>

        <button
          type="button"
          class="status-toggle"
          class:completed={status === 'completed' && !locked}
          class:signed={locked}
          onclick={toggleStatus}
          disabled={locked}
        >
          {#if locked}
            🔒 Unterschrieben
          {:else if status === 'open'}
            ● Offen
          {:else}
            ✓ Abgeschlossen
          {/if}
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
        <button
          type="button"
          class:active={activeTab === 'unterschrift'}
          onclick={() => openSectionTab('unterschrift')}
        >
          Unterschrift
        </button>
      </div>

      <div class="tab-content">
        {#if activeTab === 'übersicht'}
          <div class="overview">
            {#if reportId}
              <TimeClock {reportId} {locked} onChanged={refreshSummary} />
            {/if}
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
                disabled={locked}
              ></textarea>
            </label>
          </div>
        {:else if activeTab === 'zeiten' && reportId}
          <TimeEntrySection {reportId} {locked} onChanged={refreshSummary} />
        {:else if activeTab === 'material' && reportId}
          <MaterialSection {reportId} {locked} onChanged={refreshSummary} />
        {:else if activeTab === 'fotos' && reportId}
          <PhotoSection {reportId} {locked} onChanged={refreshSummary} />
        {:else if activeTab === 'unterschrift' && reportId}
          <SignatureSection
            {signatureBlob}
            {signedByName}
            {signedAt}
            defaultName={contactPerson}
            onSave={saveSignature}
            onClear={clearSignature}
          />
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

  .locked-banner {
    margin: var(--space-4) var(--space-4) 0;
    padding: var(--space-3) var(--space-4);
    background: var(--color-open-bg);
    color: var(--color-open);
    border-radius: var(--radius-md);
    font-size: 0.85rem;
    font-weight: 600;
    line-height: 1.4;
  }

  .fields {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
  }

  .fields input:disabled,
  .overview textarea:disabled {
    opacity: 0.7;
  }

  .status-toggle:disabled {
    opacity: 0.7;
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

  .status-toggle.signed {
    background: var(--color-signed-bg);
    color: var(--color-signed);
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
