<script lang="ts">
  // iOS Safari unterstützt kein `beforeinstallprompt`-Event - daher ein
  // manueller Hinweis, wie man die App per "Zum Home-Bildschirm hinzufügen"
  // installiert. Wird einmalig dauerhaft ausgeblendet, wenn der Nutzer es
  // wegtippt oder die App bereits im Standalone-Modus läuft.
  const STORAGE_KEY = 'e-servicebericht:install-hint-dismissed';

  function isIOS(): boolean {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }

  function isStandalone(): boolean {
    const nav = navigator as Navigator & { standalone?: boolean };
    return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  }

  let visible = $state(false);

  $effect(() => {
    if (typeof window === 'undefined') return;
    const dismissed = localStorage.getItem(STORAGE_KEY) === '1';
    visible = isIOS() && !isStandalone() && !dismissed;
  });

  function dismiss(): void {
    visible = false;
    localStorage.setItem(STORAGE_KEY, '1');
  }
</script>

{#if visible}
  <div class="install-hint" role="status">
    <p>
      Tipp: Für den App-Modus auf <strong>Teilen</strong>
      <span aria-hidden="true">⬆️</span> tippen und dann
      <strong>„Zum Home-Bildschirm“</strong> wählen.
    </p>
    <button type="button" class="close" onclick={dismiss} aria-label="Hinweis schließen">✕</button>
  </div>
{/if}

<style>
  .install-hint {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    padding-top: calc(var(--space-3) + var(--safe-top));
    background: var(--color-primary);
    color: var(--color-primary-contrast);
    font-size: 0.9rem;
  }

  .install-hint p {
    margin: 0;
    flex: 1;
  }

  .close {
    background: transparent;
    border: none;
    color: inherit;
    font-size: 1.1rem;
    padding: var(--space-2);
    line-height: 1;
    min-height: auto;
  }
</style>
