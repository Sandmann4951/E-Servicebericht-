<script lang="ts">
  import type { ReportStatus } from '../db/types';

  let { status }: { status: ReportStatus } = $props();
</script>

<span class="badge" class:open={status === 'open'} class:completed={status === 'completed'}>
  {status === 'open' ? 'Offen' : 'Abgeschlossen'}
</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 10px;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .open {
    background: var(--color-open-bg);
    color: var(--color-open);
  }

  .completed {
    background: var(--color-completed-bg);
    color: var(--color-completed);
  }
</style>
