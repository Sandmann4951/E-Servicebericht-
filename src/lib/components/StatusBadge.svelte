<script lang="ts">
  import type { ReportStatus } from '../db/types';

  // `signed`/`locked` sind bewusst getrennt von `status` (statt weiterer
  // ReportStatus-Werte): gesperrte Berichte sind in den Daten immer auch
  // `completed` (siehe finalizeReport()/setReportSignature()) -
  // "Unterschrieben"/"Final abgeschlossen" sind hier nur genauere Anzeigen
  // desselben Zustands, kein eigener Datenbank-Status. `signed` impliziert
  // `locked`, wird hier aber trotzdem separat übergeben statt abgeleitet, um
  // die Komponente nicht an die genaue Lock-Logik zu koppeln.
  let { status, signed = false, locked = false }: { status: ReportStatus; signed?: boolean; locked?: boolean } =
    $props();
</script>

<span
  class="badge"
  class:open={status === 'open'}
  class:completed={status === 'completed' && !locked}
  class:signed={signed || locked}
>
  {#if signed}
    🔒 Unterschrieben
  {:else if locked}
    🔒 Final abgeschlossen
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
