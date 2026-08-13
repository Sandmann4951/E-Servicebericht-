<script lang="ts">
  import {
    createReport,
    deleteReport,
    finalizeReport,
    getReport,
    listReportsByProjectNumber,
    markReportExported,
    setReportSignature,
    unlockReport,
    updateReport
  } from '../lib/db/reports';
  import { getActiveTimeEntry } from '../lib/db/timeEntries';
  import { switchToIdle } from '../lib/clockActions';
  import type { ReportStatus } from '../lib/db/types';
  import { navigate } from '../lib/router.svelte';
  import { debounce } from '../lib/utils/debounce';
  import { formatDurationMinutes } from '../lib/utils/date';
  import { getTechnicianName, setTechnicianName } from '../lib/settings';
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
  // Bei einem neuen Bericht mit dem zuletzt verwendeten Techniker-Namen
  // vorausfüllen (lokal auf dem Gerät gemerkt, siehe lib/settings.ts) - erspart
  // erneutes Eintippen bei jedem einzelnen Bericht.
  let technicianName = $state(isNewRoute ? getTechnicianName() : '');
  let notes = $state('');
  let status = $state<ReportStatus>('open');

  let timeEntryCount = $state(0);
  let totalDurationMinutes = $state(0);
  let materialItemCount = $state(0);
  let photoCount = $state(0);

  let signatureBlob = $state<Blob | undefined>(undefined);
  let signedByName = $state<string | undefined>(undefined);
  let signedAt = $state<string | undefined>(undefined);
  let finalizedAt = $state<string | undefined>(undefined);

  /**
   * Gibt an, der wievielte Bericht dieser unter allen Berichten mit derselben
   * Projektnummer ist (z.B. wiederkehrender Kunde/Standort) - `undefined`,
   * wenn es der einzige ist. Wird einmalig beim Laden anhand der zu diesem
   * Zeitpunkt gespeicherten Projektnummer ermittelt (siehe Lade-Effekt unten);
   * ändert sich die Projektnummer danach, bleibt die Anzeige bis zum nächsten
   * Neuladen auf dem alten Stand - für eine reine Info-Anzeige unkritisch.
   */
  let projectVisitInfo = $state<{ index: number; total: number } | undefined>(undefined);

  // Ein final abgeschlossener Bericht darf nicht mehr verändert werden - die
  // Sperre hängt an `finalizedAt`, das sowohl beim Unterschreiben als auch
  // beim manuellen Abschließen ohne Unterschrift gesetzt wird (siehe
  // saveSignature()/finalizeWithoutSignature()). Einziger Weg zurück: die
  // Sperre bewusst wieder aufheben (unlockManually() bzw. "Entfernen" im
  // Unterschrift-Tab).
  const locked = $derived(!!finalizedAt);

  // Kopfdaten sind bei einem neuen Bericht ausgeklappt (müssen ja erst
  // ausgefüllt werden), bei einem bereits vorhandenen dagegen eingeklappt -
  // spart auf kleinen Bildschirmen Platz für die eigentliche Arbeit
  // (Zeiten/Material/Fotos). Per Tap auf die Kopfzeile jederzeit umschaltbar.
  let fieldsExpanded = $state(isNewRoute);

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

  /** Wie onFieldChange(), merkt sich den Techniker-Namen zusätzlich lokal als neuen Standard für künftige Berichte (siehe lib/settings.ts). */
  function onTechnicianNameInput(): void {
    onFieldChange();
    setTechnicianName(technicianName);
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
      finalizedAt = report.finalizedAt;
      loading = false;

      listReportsByProjectNumber(report.projectNumber).then((related) => {
        if (cancelled) return;
        if (related.length > 1) {
          projectVisitInfo = { index: related.findIndex((r) => r.id === report.id) + 1, total: related.length };
        } else {
          projectVisitInfo = undefined;
        }
      });
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

  /**
   * Beendet eine ggf. noch laufende Stempeluhr dieses Berichts - wird sowohl
   * beim Unterschreiben als auch beim manuellen Abschließen ohne Unterschrift
   * aufgerufen, damit beim Sperren kein offener Zeiteintrag zurückbleibt.
   *
   * Nutzt bewusst switchToIdle() (wie das normale "Auschecken" in TimeClock)
   * statt den Eintrag nur direkt zu schließen: sonst bleibt der Tagesstempel
   * zwar aktiv, aber ohne offenen Abschnitt zurück - ein Zustand, den der Rest
   * der App nie erwartet (siehe checkInDay()). Konkret bewirkte das einen Bug:
   * die "Heute bisher"-Kachel in der Berichtsliste fror danach ein, weil ihr
   * Live-Update-Intervall an einen offenen Eintrag gekoppelt ist. switchToIdle()
   * eröffnet stattdessen sofort einen neuen Leerlaufzeit-Abschnitt, genau wie
   * beim manuellen Auschecken aus einem Projekt.
   */
  async function autoStopActiveClock(): Promise<void> {
    if (!reportId) return;
    const activeEntry = await getActiveTimeEntry(reportId);
    if (!activeEntry) return;
    await switchToIdle();
    await refreshSummary();
  }

  async function saveSignature(blob: Blob, name: string, width: number, height: number): Promise<void> {
    if (!reportId) return;
    const updated = await setReportSignature(reportId, { blob, signedByName: name, width, height });
    if (!updated) return;
    signatureBlob = updated.signatureBlob;
    signedByName = updated.signedByName;
    signedAt = updated.signedAt;
    finalizedAt = updated.finalizedAt;
    flashSaved();

    // Unterschreiben sperrt den Bericht (siehe `locked`). Der Status springt
    // konsequent auf "Abgeschlossen".
    await autoStopActiveClock();
    if (status !== 'completed') status = 'completed';
    await queueSave();
  }

  /** Schließt den Bericht final ab, ohne Kunden-Unterschrift - z.B. wenn keine Unterschrift nötig oder möglich ist. */
  async function finalizeWithoutSignature(): Promise<void> {
    if (!reportId || locked) return;
    if (
      !confirm(
        'Bericht ohne Kunden-Unterschrift final abschließen? Er wird danach gesperrt und lässt sich nicht mehr ändern, bis die Sperre wieder aufgehoben wird.'
      )
    )
      return;
    const updated = await finalizeReport(reportId);
    if (!updated) return;
    status = updated.status;
    finalizedAt = updated.finalizedAt;
    flashSaved();
    await autoStopActiveClock();
  }

  /** Hebt die Sperre auf (egal ob durch Unterschrift oder manuelles Abschließen entstanden) - ohne eigene Bestätigung, wird von den aufrufenden Stellen jeweils selbst abgefragt. */
  async function clearSignature(): Promise<void> {
    if (!reportId) return;
    const updated = await unlockReport(reportId);
    if (!updated) return;
    signatureBlob = updated.signatureBlob;
    signedByName = updated.signedByName;
    signedAt = updated.signedAt;
    finalizedAt = updated.finalizedAt;
    flashSaved();
  }

  /** Sperre-aufheben-Button im Banner - Bestätigungstext hängt davon ab, ob dabei auch eine Unterschrift verloren geht. */
  async function unlockManually(): Promise<void> {
    const message = signedAt
      ? 'Bericht entsperren? Dabei wird auch die vorhandene Kunden-Unterschrift entfernt - für eine erneute Freigabe muss ggf. neu unterschrieben werden.'
      : 'Bericht wirklich entsperren? Er wird dadurch wieder bearbeitbar.';
    if (!confirm(message)) return;
    await clearSignature();
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
        await markReportExported(reportId);
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
      await markReportExported(reportId);
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
        <div class="locked-banner">
          <p>
            {#if signedAt}
              🔒 Unterschrieben am {new Date(signedAt).toLocaleString('de-DE')}{signedByName ? ` von ${signedByName}` : ''} – der Bericht ist gesperrt.
            {:else}
              🔒 Final abgeschlossen am {finalizedAt ? new Date(finalizedAt).toLocaleString('de-DE') : ''} (ohne Unterschrift) – der Bericht ist gesperrt.
            {/if}
          </p>
          <button type="button" class="unlock" onclick={unlockManually}>🔓 Sperre aufheben</button>
        </div>
      {/if}
      {#if reportId}
        <button
          type="button"
          class="fields-toggle"
          onclick={() => (fieldsExpanded = !fieldsExpanded)}
          aria-expanded={fieldsExpanded}
        >
          <span class="fields-toggle-text">
            <strong>{projectNumber || 'Ohne Projektnummer'}</strong>
            {#if customer}<span class="fields-toggle-customer"> · {customer}</span>{/if}
            {#if projectVisitInfo}
              <span class="visit-badge">{projectVisitInfo.index}. von {projectVisitInfo.total} Berichten</span>
            {/if}
          </span>
          <span class="chevron" class:open={fieldsExpanded}>▾</span>
        </button>
      {/if}
      {#if !reportId || fieldsExpanded}
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
            oninput={onTechnicianNameInput}
            onblur={flushNow}
            placeholder="Dein Name"
            disabled={locked}
          />
        </label>

        <div class="status-row">
          <button
            type="button"
            class="status-toggle"
            class:completed={status === 'completed' && !locked}
            class:signed={locked}
            onclick={toggleStatus}
            disabled={locked}
          >
            {#if locked && signedAt}
              🔒 Unterschrieben
            {:else if locked}
              🔒 Final abgeschlossen
            {:else if status === 'open'}
              ● Offen
            {:else}
              ✓ Abgeschlossen
            {/if}
          </button>
          {#if !locked}
            <button type="button" class="finalize-btn" onclick={finalizeWithoutSignature}>
              🔒 Ohne Unterschrift final abschließen
            </button>
          {/if}
        </div>
      </div>
      {/if}

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
    background: var(--color-signed-bg);
    color: var(--color-signed);
    border-radius: var(--radius-md);
    font-size: 0.85rem;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    align-items: flex-start;
  }

  .locked-banner p {
    margin: 0;
    font-weight: 600;
    line-height: 1.4;
  }

  .locked-banner .unlock {
    background: transparent;
    border: 1px solid currentColor;
    color: inherit;
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-4);
    min-height: auto;
    font-weight: 600;
    font-size: 0.8rem;
  }

  .fields-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    width: 100%;
    background: var(--color-surface);
    border: none;
    border-bottom: 1px solid var(--color-border);
    padding: var(--space-4);
    text-align: left;
    min-height: auto;
  }

  .fields-toggle-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fields-toggle-customer {
    color: var(--color-text-muted);
    font-weight: 400;
  }

  .visit-badge {
    margin-left: var(--space-2);
    padding: 2px var(--space-2);
    border-radius: 999px;
    background: var(--color-surface-muted);
    color: var(--color-text-muted);
    font-size: 0.7rem;
    font-weight: 600;
  }

  .chevron {
    flex-shrink: 0;
    color: var(--color-text-muted);
    transition: transform 0.15s ease;
  }

  .chevron.open {
    transform: rotate(180deg);
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

  .status-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
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

  .finalize-btn {
    background: transparent;
    border: 1px dashed var(--color-border);
    color: var(--color-text-muted);
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-4);
    font-size: 0.8rem;
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
