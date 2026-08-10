<script lang="ts">
  import type { ServiceReport } from '../db/types';
  import StatusBadge from './StatusBadge.svelte';
  import { formatDateTimeDE, formatDurationMinutes } from '../utils/date';
  import { navigate } from '../router.svelte';

  let { report }: { report: ServiceReport } = $props();

  function open(): void {
    navigate(`/reports/${report.id}`);
  }

  function plural(count: number, singular: string, plural: string): string {
    return count === 1 ? singular : plural;
  }
</script>

<button type="button" class="card" onclick={open}>
  <div class="row">
    <span class="project">{report.projectNumber || 'Ohne Projektnummer'}</span>
    <StatusBadge status={report.status} />
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

  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
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
</style>
