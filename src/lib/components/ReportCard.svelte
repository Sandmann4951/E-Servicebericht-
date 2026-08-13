<script lang="ts">
  import type { ServiceReport } from '../db/types';
  import StatusBadge from './StatusBadge.svelte';
  import { formatDateTimeDE, formatDurationMinutes } from '../utils/date';
  import { navigate } from '../router.svelte';

  let { report, checkedIn = false }: { report: ServiceReport; checkedIn?: boolean } = $props();

  function open(): void {
    navigate(`/reports/${report.id}`);
  }

  function plural(count: number, singular: string, plural: string): string {
    return count === 1 ? singular : plural;
  }
</script>

<button type="button" class="card" class:checked-in={checkedIn} onclick={open}>
  <div class="row">
    <span class="project">{report.projectNumber || 'Ohne Projektnummer'}</span>
    <div class="badges">
      {#if checkedIn}
        <span class="checked-in-badge"><span class="dot"></span>Eingecheckt</span>
      {/if}
      <StatusBadge status={report.status} signed={!!report.signedAt} locked={!!report.finalizedAt} />
    </div>
  </div>

  {#if report.customer}
    <div class="customer">{report.customer}</div>
  {/if}

  <div class="summary">
    {report.timeEntryCount} {plural(report.timeEntryCount, 'Tag', 'Tage')} ·
    {formatDurationMinutes(report.totalDurationMinutes)} ·
    {report.materialItemCount} {plural(report.materialItemCount, 'Position', 'Positionen')} ·
    {report.photoCount} {plural(report.photoCount, 'Foto', 'Fotos')}
  </div>

  <div class="updated">Zuletzt geändert: {formatDateTimeDE(report.updatedAt)}</div>
  {#if report.exportedAt}
    <div class="exported">📤 Exportiert am {formatDateTimeDE(report.exportedAt)}</div>
  {/if}
</button>

<style>
  .card {
    display: block;
    width: 100%;
    text-align: left;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-4);
    min-height: auto;
  }

  .card.checked-in {
    border-color: var(--color-open);
    background: var(--color-open-bg);
  }

  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
  }

  .badges {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .checked-in-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 10px;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 700;
    background: var(--color-open);
    color: var(--color-primary-contrast);
    white-space: nowrap;
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--color-primary-contrast);
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

  .project {
    font-weight: 700;
    font-size: 1.05rem;
  }

  .customer {
    color: var(--color-text-muted);
    margin-top: var(--space-1);
  }

  .summary {
    margin-top: var(--space-2);
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }

  .updated {
    margin-top: var(--space-1);
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .exported {
    margin-top: 2px;
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }
</style>
