<script lang="ts">
  import { useRegisterSW } from 'virtual:pwa-register/svelte';
  import Icon from './Icon.svelte';

  // registerType: 'prompt' (siehe vite.config.ts) - kein automatischer
  // Reload mitten in der Eingabe eines Berichts. Stattdessen zeigen wir
  // diesen dezenten Hinweis, sobald eine neue Version bereitsteht.
  const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // Stündlich auf neue Version prüfen, während die App offen ist.
      setInterval(() => registration.update(), 60 * 60 * 1000);
    }
  });

  function reload(): void {
    updateServiceWorker(true);
  }

  function close(): void {
    needRefresh.set(false);
    offlineReady.set(false);
  }

  // "Offline bereit" ist reine Information (nichts zu tun) - blendet sich
  // von selbst aus, statt dauerhaft am unteren Bildschirmrand Taps auf
  // darunterliegende Buttons (z.B. "+ Tag hinzufügen") abzufangen.
  $effect(() => {
    if (!$offlineReady) return;
    const timeout = setTimeout(() => offlineReady.set(false), 4000);
    return () => clearTimeout(timeout);
  });
</script>

{#if $needRefresh}
  <div class="toast-wrap">
    <div class="toast" role="status">
      <span>Neue Version verfügbar.</span>
      <button type="button" class="primary" onclick={reload}>Aktualisieren</button>
      <button type="button" class="close" onclick={close} aria-label="Schließen"><Icon name="close" size={16} /></button>
    </div>
  </div>
{:else if $offlineReady}
  <div class="toast-wrap">
    <div class="toast" role="status">
      <span>Bereit für den Offline-Einsatz.</span>
      <button type="button" class="close" onclick={close} aria-label="Schließen"><Icon name="close" size={16} /></button>
    </div>
  </div>
{/if}

<style>
  /* Wrapper spannt die Breite für die Zentrierung auf, leitet Klicks aber
     durch (pointer-events: none) - nur der Toast selbst ist klickbar. So
     kann der Toast nie Buttons daneben/darunter blockieren (z.B. FAB,
     "+ Tag hinzufügen"). */
  .toast-wrap {
    position: fixed;
    left: var(--space-4);
    right: var(--space-4);
    bottom: calc(var(--space-4) + var(--safe-bottom));
    display: flex;
    justify-content: center;
    pointer-events: none;
    z-index: 50;
  }

  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    max-width: 100%;
    /* Bewusst FESTE (nicht Theme-abhängige) Farben: dieser Toast soll sich
       in beiden Themes gleich als "dunkler Hinweis-Chip" absetzen. Mit
       var(--color-text) wäre er im Dunkel-Theme fast weiß geworden - dann
       unsichtbarer weißer Text auf fast-weißem Grund. */
    background: var(--color-inverse-surface);
    color: var(--color-inverse-text);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  }

  .toast span {
    flex: 1;
    font-size: 0.9rem;
  }

  .primary {
    background: var(--color-primary);
    color: var(--color-primary-contrast);
    border: none;
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-3);
    min-height: auto;
  }

  .close {
    background: transparent;
    border: none;
    color: inherit;
    padding: var(--space-2);
    min-height: auto;
  }
</style>
