<script lang="ts">
  /**
   * Vollbild-Kamera-Overlay zum Scannen eines QR-Codes (z.B. das
   * Lieferanten-Etikett auf einem Materialpaket) - für die
   * Material-Schnellerfassung (siehe MaterialSection.svelte).
   *
   * Nutzt `jsQR` (reine JS-Implementierung, keine WASM-/native Abhängigkeit)
   * statt der nativen `BarcodeDetector`-API, da diese auf iOS Safari (dem
   * primären Zielgerät dieser App) nicht verfügbar ist. `jsQR` wird bewusst
   * per dynamischem Import erst beim tatsächlichen Öffnen des Scanners
   * nachgeladen (gleiches Muster wie beim `docx`-Export) - hält die
   * Bibliothek aus dem initialen Bundle heraus, da die meisten
   * App-Aufrufe nie scannen.
   *
   * Läuft die Kamera nicht an (kein Zugriff erlaubt, kein Gerät, o.ä.) oder
   * bevorzugt der Nutzer es: "Code manuell eingeben" nimmt denselben
   * `onScan`-Callback mit einem eingetippten/eingefügten Text entgegen - z.B.
   * wenn der Code bereits mit einer separaten Scanner-App gelesen wurde.
   */
  let { onScan, onClose }: { onScan: (text: string) => void; onClose: () => void } = $props();

  let videoEl = $state<HTMLVideoElement | undefined>();
  let error = $state<string | undefined>();
  let manualMode = $state(false);
  let manualText = $state('');

  let stream: MediaStream | undefined;
  let rafId: number | undefined;
  let scanning = false;
  let canvas: HTMLCanvasElement | undefined;
  let ctx: CanvasRenderingContext2D | undefined;
  let decodeQR: ((data: Uint8ClampedArray, width: number, height: number) => { data: string } | null) | undefined;

  function stopCamera(): void {
    scanning = false;
    if (rafId !== undefined) cancelAnimationFrame(rafId);
    rafId = undefined;
    stream?.getTracks().forEach((track) => track.stop());
    stream = undefined;
  }

  function scanLoop(): void {
    if (!scanning) return;
    if (videoEl && decodeQR && videoEl.readyState >= videoEl.HAVE_CURRENT_DATA && videoEl.videoWidth > 0) {
      if (!canvas) canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      if (!ctx) ctx = canvas.getContext('2d', { willReadFrequently: true }) ?? undefined;
      if (ctx) {
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = decodeQR(imageData.data, imageData.width, imageData.height);
        if (code?.data) {
          stopCamera();
          onScan(code.data);
          return;
        }
      }
    }
    rafId = requestAnimationFrame(scanLoop);
  }

  async function startCamera(): Promise<void> {
    try {
      // jsQR exportiert seine Decode-Funktion als default-Export.
      const jsQRModule = await import('jsqr');
      decodeQR = jsQRModule.default;
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
      if (!videoEl) return; // Komponente wurde inzwischen geschlossen
      videoEl.srcObject = stream;
      await videoEl.play();
      scanning = true;
      rafId = requestAnimationFrame(scanLoop);
    } catch {
      error = 'Kamera konnte nicht gestartet werden - Zugriff erlaubt? Alternativ den Code unten manuell eingeben.';
    }
  }

  $effect(() => {
    void startCamera();
    return () => stopCamera();
  });

  function submitManual(): void {
    const text = manualText.trim();
    if (!text) return;
    stopCamera();
    onScan(text);
  }
</script>

<div class="scanner-overlay" role="dialog" aria-modal="true" aria-label="Material scannen">
  <header class="scanner-header">
    <p>Material scannen</p>
    <button type="button" class="close" onclick={onClose} aria-label="Scanner schließen">✕</button>
  </header>

  {#if !manualMode}
    <div class="video-wrap">
      <!-- svelte-ignore a11y_media_has_caption -->
      <video bind:this={videoEl} playsinline muted></video>
      <div class="viewfinder"></div>
      {#if error}
        <p class="error">{error}</p>
      {:else}
        <p class="hint">QR-Code des Lieferanten-Etiketts in den Rahmen halten</p>
      {/if}
    </div>
  {/if}

  <div class="manual-area">
    {#if manualMode}
      <label class="manual-label">
        Gescannter Text (z.B. aus einer anderen Scanner-App)
        <textarea rows="3" bind:value={manualText} placeholder="Code hier einfügen…"></textarea>
      </label>
      <div class="manual-actions">
        <button type="button" class="ghost" onclick={() => (manualMode = false)}>Zurück zur Kamera</button>
        <button type="button" class="primary" onclick={submitManual} disabled={!manualText.trim()}>Übernehmen</button>
      </div>
    {:else}
      <button type="button" class="manual-toggle" onclick={() => (manualMode = true)}>Code manuell eingeben</button>
    {/if}
  </div>
</div>

<style>
  .scanner-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: #000;
    display: flex;
    flex-direction: column;
    color: #fff;
  }

  .scanner-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    background: rgba(0, 0, 0, 0.6);
  }

  .scanner-header p {
    margin: 0;
    font-weight: 600;
  }

  .close {
    background: transparent;
    border: none;
    color: #fff;
    font-size: 1.2rem;
    min-height: auto;
    padding: var(--space-2);
  }

  .video-wrap {
    position: relative;
    flex: 1;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #000;
  }

  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .viewfinder {
    position: absolute;
    inset: 15% 12%;
    border: 3px solid rgba(255, 255, 255, 0.85);
    border-radius: var(--radius-md);
    box-shadow: 0 0 0 2000px rgba(0, 0, 0, 0.35);
    pointer-events: none;
  }

  .hint,
  .error {
    position: absolute;
    bottom: var(--space-4);
    left: var(--space-4);
    right: var(--space-4);
    text-align: center;
    font-size: 0.85rem;
    background: rgba(0, 0, 0, 0.6);
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-3);
  }

  .error {
    color: #fecaca;
  }

  .manual-area {
    padding: var(--space-3) var(--space-4);
    background: rgba(0, 0, 0, 0.75);
  }

  .manual-toggle {
    width: 100%;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.4);
    color: #fff;
    border-radius: var(--radius-sm);
    padding: var(--space-2);
    font-size: 0.85rem;
  }

  .manual-label {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.85);
  }

  .manual-label textarea {
    font-family: inherit;
    font-size: 1rem;
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    border: 1px solid rgba(255, 255, 255, 0.4);
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
    resize: vertical;
  }

  .manual-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .manual-actions .ghost {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.4);
    color: #fff;
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-4);
    min-height: auto;
  }

  .manual-actions .primary {
    background: var(--color-primary);
    color: var(--color-primary-contrast);
    border: none;
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-4);
    min-height: auto;
    font-weight: 600;
  }

  .manual-actions .primary:disabled {
    opacity: 0.5;
  }
</style>
