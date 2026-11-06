<script lang="ts">
  /**
   * Vollbild-Kamera-Overlay zum Erfassen eines Lieferanten-Etiketts ODER
   * eines ganzen Lieferscheins für die Material-Schnellerfassung (siehe
   * MaterialSection.svelte), mit drei Modi:
   * - "QR-Code": liest fortlaufend per `jsQR` einen QR-/Barcode aus dem
   *   Live-Videobild (z.B. den GS1-Code auf dem Etikett) - siehe onScan.
   * - "Etikett-Text": nimmt auf Tastendruck ein einzelnes Standbild auf und
   *   erkennt den gedruckten Text darauf per Texterkennung (OCR, `tesseract.js`) -
   *   viele Lieferanten-Etiketten tragen Artikelnummer, Beschreibung UND
   *   Stückzahl bereits als lesbaren Text, nicht nur im Code - siehe onOcrText.
   * - "Lieferschein": gleiche Foto+OCR-Technik wie "Etikett-Text", aber für
   *   einen ganzen Lieferschein mit MEHREREN Artikelpositionen statt nur
   *   einem einzelnen Etikett - siehe onDeliveryNoteText.
   *
   * In "Etikett-Text" und "Lieferschein" gibt es neben "📸 Foto aufnehmen"
   * (Standbild aus der Live-Vorschau) zusätzlich "Foto aus Kamera-App/
   * Galerie wählen" (`<input type="file">`, gleiches Muster wie in
   * PhotoSection.svelte) - echter Kamera-Autofokus ist über die
   * getUserMedia-Live-Vorschau im Browser nicht zuverlässig erzwingbar
   * (besonders auf iOS Safari), die native Kamera-App dahinter liefert
   * dagegen deutlich schärfere Fotos. Beide Wege münden in derselben
   * Texterkennung, siehe recognizeText().
   *
   * Beide nachgeladenen Bibliotheken (`jsQR`, `tesseract.js`) werden bewusst
   * erst beim tatsächlichen Öffnen des Scanners bzw. Umschalten in den
   * Etikett-Text-Modus per dynamischem Import nachgeladen (gleiches Muster
   * wie beim `docx`-Export) - hält sie aus dem initialen Bundle heraus.
   *
   * `tesseract.js` läuft dabei komplett offline: Worker-Skript, WASM-Kern
   * und die deutschen Trainingsdaten liegen selbst gehostet unter
   * `public/tesseract/` bzw. `public/tessdata/` (kein CDN-Aufruf zu Drittanbietern,
   * passend zum Offline-first-Anspruch der App) und werden beim ersten
   * Etikett-Text-Scan per Workbox-Runtime-Caching dauerhaft im Service
   * Worker zwischengespeichert (siehe vite.config.ts) - nicht im initialen
   * Precache, da nicht jeder Nutzer dieses Feature verwendet.
   *
   * Läuft die Kamera gar nicht an (kein Zugriff erlaubt, kein Gerät, o.ä.)
   * oder wurde ein Code bereits mit einer separaten Scanner-App gelesen,
   * lässt sich der Text stattdessen über "Code manuell eingeben" einfügen -
   * derselbe Verarbeitungsweg wie beim QR-Scan (onScan).
   */
  let {
    onScan,
    onOcrText,
    onDeliveryNoteText,
    onClose
  }: {
    onScan: (text: string) => void;
    onOcrText: (text: string) => void;
    onDeliveryNoteText: (text: string) => void;
    onClose: () => void;
  } = $props();

  type Mode = 'qr' | 'photo' | 'delivery';

  let videoEl = $state<HTMLVideoElement | undefined>();
  let mode = $state<Mode>('qr');
  let error = $state<string | undefined>();
  let manualMode = $state(false);
  let manualText = $state('');
  let ocrRunning = $state(false);
  let ocrError = $state<string | undefined>();

  let stream: MediaStream | undefined;
  let rafId: number | undefined;
  let qrScanning = false;
  let canvas: HTMLCanvasElement | undefined;
  let ctx: CanvasRenderingContext2D | undefined;
  let decodeQR: ((data: Uint8ClampedArray, width: number, height: number) => { data: string } | null) | undefined;

  function stopCamera(): void {
    qrScanning = false;
    if (rafId !== undefined) cancelAnimationFrame(rafId);
    rafId = undefined;
    stream?.getTracks().forEach((track) => track.stop());
    stream = undefined;
  }

  function qrScanLoop(): void {
    if (!qrScanning) return;
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
    rafId = requestAnimationFrame(qrScanLoop);
  }

  function startQrLoop(): void {
    if (qrScanning) return;
    qrScanning = true;
    rafId = requestAnimationFrame(qrScanLoop);
  }

  function stopQrLoop(): void {
    qrScanning = false;
    if (rafId !== undefined) cancelAnimationFrame(rafId);
    rafId = undefined;
  }

  function setMode(next: Mode): void {
    mode = next;
    ocrError = undefined;
    if (next === 'qr') {
      startQrLoop();
    } else {
      stopQrLoop();
    }
  }

  async function startCamera(): Promise<void> {
    try {
      // jsQR exportiert seine Decode-Funktion als default-Export.
      const jsQRModule = await import('jsqr');
      decodeQR = jsQRModule.default;
      // Höhere Zielauflösung + `focusMode: 'continuous'` (wo unterstützt,
      // z.B. Android/Chrome) sollen den Autofokus der Live-Vorschau
      // verbessern - auf Geräten/Browsern ohne Unterstützung (u.a.
      // vermutlich iOS Safari) ignoriert die Engine diese "ideal"-Werte
      // einfach, schadet also nicht. Kein Allheilmittel: echter Autofokus
      // ist über getUserMedia nicht zuverlässig erzwingbar - deshalb gibt
      // es zusätzlich den "Foto auswählen"-Weg unten (nutzt die native
      // Kamera-App mit echtem Autofokus statt nur der Video-Vorschau).
      const videoConstraints: MediaTrackConstraints & {
        advanced?: (MediaTrackConstraintSet & { focusMode?: string })[];
      } = {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        advanced: [{ focusMode: 'continuous' }]
      };
      stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
      if (!videoEl) return; // Komponente wurde inzwischen geschlossen
      videoEl.srcObject = stream;
      await videoEl.play();
      if (mode === 'qr') startQrLoop();
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

  let fileInput: HTMLInputElement | undefined;

  /**
   * Erkennt den gedruckten Text eines Bildes per `tesseract.js` (deutsches
   * Sprachmodell, LSTM-Engine - passend zur selbst gehosteten
   * Kernbibliothek unter public/tesseract/). Gemeinsame Grundlage für
   * sowohl den Video-Standbild-Weg (capturePhoto()) als auch ein über
   * "Foto auswählen" gewähltes Bild (handleFileSelected()) - dieselbe
   * Erkennung, egal woher das Bild kommt.
   *
   * Zeichnet das Bild dabei bewusst um Faktor 1.5 hochskaliert (analog zur
   * 2x-Skalierung bei der PDF-OCR, siehe serviceOrderPdf.ts
   * extractPdfTextViaOcr()) und mit leicht angehobenem Kontrast/Helligkeit
   * (`ctx.filter`) - verbessert die Trefferquote bei leicht
   * unscharfen/kontrastarmen Fotos spürbar, ist aber kein Allheilmittel
   * gegen starke Unschärfe (dagegen hilft nur ein tatsächlich scharfes
   * Ausgangsbild, siehe "Foto auswählen"-Weg unten).
   */
  async function recognizeText(
    source: CanvasImageSource,
    naturalWidth: number,
    naturalHeight: number
  ): Promise<string> {
    const scale = 1.5;
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = Math.round(naturalWidth * scale);
    captureCanvas.height = Math.round(naturalHeight * scale);
    const captureCtx = captureCanvas.getContext('2d');
    if (!captureCtx) throw new Error('Kein Canvas-Kontext');
    captureCtx.filter = 'contrast(1.25) brightness(1.05)';
    captureCtx.drawImage(source, 0, 0, captureCanvas.width, captureCanvas.height);

    const { createWorker } = await import('tesseract.js');
    const base = import.meta.env.BASE_URL;
    const worker = await createWorker('deu', 1, {
      workerPath: `${base}tesseract/worker.min.js`,
      corePath: `${base}tesseract/tesseract-core-lstm.wasm.js`,
      langPath: `${base}tessdata`,
      gzip: true
    });
    try {
      const {
        data: { text }
      } = await worker.recognize(captureCanvas);
      return text;
    } finally {
      await worker.terminate();
    }
  }

  /** Reicht das erkannte Ergebnis je nach Modus an den passenden Callback weiter - gemeinsam für Video-Capture und Datei-Auswahl. */
  function deliverOcrText(text: string): void {
    if (mode === 'delivery') {
      onDeliveryNoteText(text);
    } else {
      onOcrText(text);
    }
  }

  /** Nimmt das aktuelle Kamerabild als Standbild auf und erkennt den gedruckten Text darauf. Läuft im Hintergrund einige Sekunden, daher der `ocrRunning`-Ladezustand. */
  async function capturePhoto(): Promise<void> {
    if (!videoEl || ocrRunning) return;
    ocrRunning = true;
    ocrError = undefined;
    try {
      const text = await recognizeText(videoEl, videoEl.videoWidth, videoEl.videoHeight);
      stopCamera();
      deliverOcrText(text);
    } catch {
      ocrError = 'Texterkennung fehlgeschlagen - nochmal versuchen oder den Text unten manuell eingeben.';
    } finally {
      ocrRunning = false;
    }
  }

  function loadImageFile(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Bild konnte nicht geladen werden'));
      };
      img.src = url;
    });
  }

  /**
   * Alternative zum Live-Video-Standbild: öffnet den normalen Datei-/
   * Kamera-Dialog des Geräts (gleiches `<input type="file">`-Muster wie in
   * PhotoSection.svelte). Ein darüber aufgenommenes Foto durchläuft die
   * NATIVE Kamera-App des Handys mit echtem Autofokus/Belichtungsautomatik
   * - das liefert deutlich schärfere Bilder als der per getUserMedia aus
   * der Live-Vorschau gegriffene Frame, dessen Autofokus im Browser nicht
   * zuverlässig steuerbar ist (besonders auf iOS Safari). Ebenso nutzbar,
   * um ein bereits vorhandenes (schon scharfes) Foto aus der Galerie zu
   * wählen, statt neu zu fotografieren.
   */
  async function handleFileSelected(fileList: FileList | null): Promise<void> {
    const file = fileList?.[0];
    if (!file || ocrRunning) return;
    ocrRunning = true;
    ocrError = undefined;
    try {
      const img = await loadImageFile(file);
      const text = await recognizeText(img, img.naturalWidth, img.naturalHeight);
      stopCamera();
      deliverOcrText(text);
    } catch {
      ocrError = 'Texterkennung fehlgeschlagen - nochmal versuchen oder den Text unten manuell eingeben.';
    } finally {
      ocrRunning = false;
    }
  }
</script>

<div class="scanner-overlay" role="dialog" aria-modal="true" aria-label="Material scannen">
  <header class="scanner-header">
    <p>Material scannen</p>
    <button type="button" class="close" onclick={onClose} aria-label="Scanner schließen">✕</button>
  </header>

  {#if !manualMode}
    <div class="mode-toggle" role="tablist" aria-label="Erfassungsart">
      <button type="button" class:active={mode === 'qr'} onclick={() => setMode('qr')}>QR-Code</button>
      <button type="button" class:active={mode === 'photo'} onclick={() => setMode('photo')}>Etikett-Text</button>
      <button type="button" class:active={mode === 'delivery'} onclick={() => setMode('delivery')}>Lieferschein</button>
    </div>

    <div class="video-wrap">
      <!-- svelte-ignore a11y_media_has_caption -->
      <video bind:this={videoEl} playsinline muted></video>
      <div class="viewfinder"></div>
      {#if ocrRunning}
        <p class="hint processing">Text wird erkannt… (kann einige Sekunden dauern)</p>
      {:else if error}
        <p class="error">{error}</p>
      {:else if ocrError}
        <p class="error">{ocrError}</p>
      {:else if mode === 'qr'}
        <p class="hint">QR-Code des Lieferanten-Etiketts in den Rahmen halten</p>
      {:else if mode === 'photo'}
        <p class="hint">Etikett-Text (Artikelnummer, Bezeichnung, Menge) in den Rahmen halten, dann Foto aufnehmen</p>
      {:else}
        <p class="hint">Lieferschein mit mehreren Positionen in den Rahmen halten, dann Foto aufnehmen</p>
      {/if}
    </div>

    {#if mode === 'photo' || mode === 'delivery'}
      <div class="capture-area">
        <button type="button" class="capture" onclick={capturePhoto} disabled={ocrRunning}>📸 Foto aufnehmen</button>
        <button type="button" class="pick-file" onclick={() => fileInput?.click()} disabled={ocrRunning}>
          Foto aus Kamera-App/Galerie wählen
        </button>
        <p class="capture-tip">
          Für beste Ergebnisse: Handy kurz stillhalten, bis das Bild scharf ist - oder ein bereits aufgenommenes,
          scharfes Foto auswählen.
        </p>
      </div>
    {/if}
  {/if}

  <input
    bind:this={fileInput}
    type="file"
    accept="image/*"
    capture="environment"
    class="visually-hidden"
    onchange={(event) => {
      void handleFileSelected(event.currentTarget.files);
      event.currentTarget.value = '';
    }}
  />

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

  .mode-toggle {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    background: rgba(0, 0, 0, 0.6);
  }

  .mode-toggle button {
    flex: 1;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.4);
    color: rgba(255, 255, 255, 0.8);
    border-radius: var(--radius-sm);
    padding: var(--space-2);
    font-size: 0.85rem;
    min-height: auto;
  }

  .mode-toggle button.active {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: var(--color-primary-contrast);
    font-weight: 600;
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

  .hint.processing {
    color: var(--color-primary);
    font-weight: 600;
  }

  .error {
    color: #fecaca;
  }

  .capture-area {
    padding: var(--space-3) var(--space-4);
    background: rgba(0, 0, 0, 0.75);
  }

  .capture {
    width: 100%;
    background: var(--color-primary);
    color: var(--color-primary-contrast);
    border: none;
    border-radius: var(--radius-sm);
    padding: var(--space-3);
    font-weight: 600;
  }

  .capture:disabled {
    opacity: 0.5;
  }

  .pick-file {
    width: 100%;
    margin-top: var(--space-2);
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.4);
    color: #fff;
    border-radius: var(--radius-sm);
    padding: var(--space-2);
    font-size: 0.85rem;
  }

  .pick-file:disabled {
    opacity: 0.5;
  }

  .capture-tip {
    margin: var(--space-2) 0 0;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.7);
    text-align: center;
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
