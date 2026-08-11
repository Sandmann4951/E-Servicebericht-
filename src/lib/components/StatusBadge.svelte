<script lang="ts">
  import type { ReportStatus } from '../db/types';

  // `signed` ist bewusst getrennt von `status` (statt eines dritten
  // ReportStatus-Werts): unterschriebene Berichte sind in den Daten immer
  // auch `completed` (siehe automatische Statusänderung beim Unterschreiben)
  // - "Unterschrieben" ist hier nur eine genauere Anzeige desselben Zustands,
  // kein eigener Datenbank-Status.
  let { status, signed = false }: { status: ReportStatus; signed?: boolean } = $props();
</script>

<span class="badge" class:open={status === 'open'} class:completed={status === 'completed' && !signed} class:signed>
  {#if signed}
    🔒 Unterschrieben
  {:else if status === 'open'}
    Offen
  {:else}
    Abgeschlossen
  {/if}
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

  .signed {
    background: var(--color-signed-bg);
    color: var(--color-signed);
  }
</style>
