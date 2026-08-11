<script lang="ts">
  import { getGloballyActiveTimeEntry, getReport, listReports, type ReportFilter, type ServiceReport } from '../lib/db';
  import { buildBackupFile, parseBackupFile, restoreBackup, suggestedBackupFileName } from '../lib/backup/backupFile';
  import ReportCard from '../lib/components/ReportCard.svelte';
  import { navigate } from '../lib/router.svelte';

  let reports = $state<ServiceReport[]>([]);
  let filter = $state<ReportFilter>('all');
  let loading = $state(true);
  let backupBusy = $state(false);
  let backupError = $state('');
  let fileInput: HTMLInputElement | undefined;

  interface ActiveSession {
    reportId: string;
    projectNumber: string;
    startTime: string;
  }
  let activeSession = $state<ActiveSession | undefined>(undefined);

  async function loadReports(): Promise<void> {
    loading = true;
    reports = await listReports(filter);
    loading = false;
  }

  $effect(() => {
    filter;
    loadReports();
  });

  // Läuft einmal beim Mount - reicht aus, da diese Komponente bei jedem
  // Zurücknavigieren zur Liste (kein {#key}-Wrapper in App.svelte) ohnehin
  // frisch gemountet wird und so den aktuellen Stand neu abfragt.
  $effect(() => {
    getGloballyActiveTimeEntry().then(async (entry) => {
      if (!entry?.startTime) {
        activeSession = undefined;
        return;
      }
      const report = await getReport(entry.reportId);
      activeSession = report
        ? { reportId: report.id, projectNumber: report.projectNumber, startTime: entry.startTime }
        : undefined;
    });
  });

  function newReport(): void {
    navigate('/reports/new');
  }

  async function exportBackup(): Promise<void> {
    if (backupBusy) return;
    backupBusy = true;
    backupError = '';
    try {
      const blob = await buildBackupFile();
      const fileName = suggestedBackupFileName();
      const file = new File([blob], fileName, { type: 'application/json' });

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
      if (err instanceof DOMException && err.name === 'AbortError') return;
      backupError = 'Sicherung konnte nicht erstellt werden. Bitte erneut versuchen.';
      console.error('Backup-Export fehlgeschlagen', err);
    } finally {
      backupBusy = false;
    }
  }

  function triggerImport(): void {
    fileInput?.click();
  }

  async function handleImportFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // gleiche Datei muss danach erneut wählbar sein
    if (!file) return;

    backupBusy = true;
    backupError = '';
    try {
      const { data, summary } = await parseBackupFile(file);
      const confirmed = confirm(
        `Sicherung enthält ${summary.reportCount} Berichte, ${summary.timeEntryCount} Zeiteinträge, ` +
          `${summary.materialItemCount} Materialpositionen und ${summary.photoCount} Fotos.\n\n` +
          `Jetzt importieren? Vorhandene Berichte mit gleicher ID werden dabei überschrieben.`
      );
      if (!confirmed) return;

      await restoreBackup(data);
      await loadReports();
    } catch (err) {
      backupError = err instanceof Error ? err.message : 'Import fehlgeschlagen. Bitte erneut versuchen.';
      console.error('Backup-Import fehlgeschlagen', err);
    } finally {
      backupBusy = false;
    }
  }
</script>

<div class="screen">
  <header class="header">
    <h1>Serviceberichte</h1>
    <div class="backup-actions">
      <button type="button" onclick={exportBackup} disabled={backupBusy} aria-label="Sicherung exportieren">💾</button>
      <button type="button" onclick={triggerImport} disabled={backupBusy} aria-label="Sicherung wiederherstellen">
        📥
      </button>
      <input
        bind:this={fileInput}
        type="file"
        accept="application/json,.json"
        class="visually-hidden"
        onchange={handleImportFile}
      />
    </div>
  </header>
  {#if backupError}
    <p class="backup-error">{backupError}</p>
  {/if}

  {#if activeSession}
    <button type="button" class="active-session" onclick={() => navigate(`/reports/${activeSession?.reportId}`)}>
      <span class="dot"></span>
      Eingestempelt in „{activeSession.projectNumber}“ seit {activeSession.startTime}
    </button>
  {/if}

  <div class="filters" role="tablist" aria-label="Berichte filtern">
    <button type="button" class:active={filter === 'all'} onclick={() => (filter = 'all')}>Alle</button>
    <button type="button" class:active={filter === 'open'} onclick={() => (filter = 'open')}>Offen</button>
    <button type="button" class:active={filter === 'completed'} onclick={() => (filter = 'completed')}>
      Abgeschlossen
    </button>
    <button type="button" class:active={filter === 'locked'} onclick={() => (filter = 'locked')}>
      Gesperrt
    </button>
    <button type="button" class:active={filter === 'not-exported'} onclick={() => (filter = 'not-exported')}>
      Nicht exportiert
    </button>
  </div>

  <div class="content">
    {#if loading}
      <p class="hint">Lade Berichte…</p>
    {:else if reports.length === 0}
      <div class="empty">
        <p>Noch keine Serviceberichte vorhanden.</p>
        <p class="hint">Tippe unten rechts auf „+“, um deinen ersten Bericht anzulegen.</p>
      </div>
    {:else}
      <ul class="list">
        {#each reports as report (report.id)}
          <li><ReportCard {report} /></li>
        {/each}
      </ul>
    {/if}
  </div>

  <button type="button" class="fab" onclick={newReport} aria-label="Neuer Bericht">+</button>
</div>

<style>
  .screen {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: calc(var(--space-4) + var(--safe-top)) var(--space-4) var(--space-2);
  }

  .header h1 {
    margin: 0;
    font-size: 1.4rem;
  }

  .backup-actions {
    display: flex;
    gap: var(--space-1);
  }

  .backup-actions button {
    background: transparent;
    border: none;
    font-size: 1.3rem;
    padding: var(--space-2);
    min-height: auto;
  }

  .backup-actions button:disabled {
    opacity: 0.5;
  }

  .backup-error {
    margin: 0 var(--space-4) var(--space-3);
    color: var(--color-danger);
    font-size: 0.85rem;
    text-align: center;
  }

  .active-session {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0 var(--space-4) var(--space-3);
    background: var(--color-open-bg);
    color: var(--color-open);
    border: none;
    border-radius: var(--radius-md);
    padding: var(--space-3) var(--space-4);
    font-weight: 600;
    font-size: 0.9rem;
    text-align: left;
  }

  .active-session .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--color-open);
    flex-shrink: 0;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }

  .filters {
    display: flex;
    gap: var(--space-2);
    padding: 0 var(--space-4) var(--space-3);
    overflow-x: auto;
  }

  .filters button {
    min-height: 36px;
    padding: var(--space-1) var(--space-4);
    border-radius: 999px;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text-muted);
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .filters button.active {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: var(--color-primary-contrast);
  }

  .content {
    flex: 1;
    overflow-y: auto;
    padding: 0 var(--space-4) calc(var(--space-6) + var(--safe-bottom) + 64px);
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .hint {
    color: var(--color-text-muted);
    text-align: center;
    margin-top: var(--space-6);
  }

  .empty {
    text-align: center;
    margin-top: var(--space-6);
    color: var(--color-text-muted);
  }

  .empty p {
    margin: var(--space-2) 0;
  }

  .fab {
    position: fixed;
    right: var(--space-5);
    bottom: calc(var(--space-5) + var(--safe-bottom));
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: var(--color-primary);
    color: var(--color-primary-contrast);
    border: none;
    font-size: 1.8rem;
    line-height: 1;
    box-shadow: 0 8px 20px rgba(11, 95, 255, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
