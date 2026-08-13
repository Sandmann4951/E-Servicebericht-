<script lang="ts">
  import type { ReportStatus } from '../db/types';
  import Icon from './Icon.svelte';

  // `signed`/`locked` sind bewusst getrennt von `status` (statt weiterer
  // ReportStatus-Werte): gesperrte Berichte sind in den Daten immer auch
  // `completed` (siehe finalizeReport()/setReportSignature()) -
  // "Unterschrieben"/"Final abgeschlossen" sind hier nur genauere Anzeigen
  // desselben Zustands, kein eigener Datenbank-Status. `signed` impliziert
  // `locked`, wird hier aber trotzdem separat übergeben statt abgeleitet, um
  // die Komponente nicht an die genaue Lock-Logik zu koppeln.
  let { status, signed = false, locked = false }: { status: ReportStatus; signed?: boolean; locked?: boolean } =
    $props();

  // Zwei eigene CSS-Klassen statt einer gemeinsamen "signed"-Klasse für
  // beide Sperr-Varianten (Redesign Runde 2 - Feinschliff der Badge-
  // Farbsemantik): "Unterschrieben" (Kunde hat aktiv zugestimmt) und "Final
  // abgeschlossen" (manuell ohne Unterschrift gesperrt) sind rechtlich/
  // fachlich unterschiedlich und sollen sich auch farblich unterscheiden.
  const finalizedWithoutSignature = $derived(locked && !signed);
</script>

<span
  class="badge"
  class:open={status === 'open'}
  class:completed={status === 'completed' && !locked}
  class:signed
  class:finalized={finalizedWithoutSignature}
>
  {#if signed}
    <Icon name="lock" size={13} />Unterschrieben
  {:else if locked}
    <Icon name="lock" size={13} />Final abgeschlossen
  {:else if status === 'open'}
    <Icon name="circle" size={13} />Offen
  {:else}
    <Icon name="check" size={13} />Abgeschlossen
  {/if}
</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
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

  .finalized {
    background: var(--color-finalized-bg);
    color: var(--color-finalized);
  }
</style>
