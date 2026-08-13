<script lang="ts">
  import { formatDateTimeDE } from '../utils/date';

  let {
    signatureBlob,
    signedByName,
    signedAt,
    defaultName,
    onSave,
    onClear
  }: {
    signatureBlob: Blob | undefined;
    signedByName: string | undefined;
    signedAt: string | undefined;
    defaultName: string;
    onSave: (blob: Blob, name: string, width: number, height: number) => Promise<void>;
    onClear: () => Promise<void>;
  } = $props();

  let canvasEl = $state<HTMLCanvasElement | undefined>(undefined);
  let drawing = false;
  let hasDrawn = $state(false);
  let editing = $state(false);
  let nameInput = $state('');
  let saving = $state(false);
  let signatureUrl = $state<string | undefined>(undefined);

  $effect(() => {
    nameInput = signedByName || defaultName;
  });

  // Object-URL fürs Anzeigen einer bereits gespeicherten Unterschrift.
  $effect(() => {
    if (!signatureBlob) {
      signatureUrl = undefined;
      return;
    }
    const url = URL.createObjectURL(signatureBlob);
    signatureUrl = url;
    return () => URL.revokeObjectURL(url);
  });

  const showPad = $derived(editing || !signatureBlob);

  function setupCanvas(): void {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;
    // Zeichenfläche in echten Geräte-Pixeln anlegen, sonst wirkt die Linie
    // auf High-DPI-Displays (jedes iPhone) unscharf.
    const rect = canvasEl.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvasEl.width = Math.round(rect.width * ratio);
    canvasEl.height = Math.round(rect.height * ratio);
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a1f2b';
  }

  $effect(() => {
    if (showPad && canvasEl) setupCanvas();
  });

  function pointFromEvent(event: PointerEvent): { x: number; y: number } {
    const rect = canvasEl!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function startDraw(event: PointerEvent): void {
    if (!canvasEl) return;
    drawing = true;
    hasDrawn = true;
    const ctx = canvasEl.getContext('2d');
    const { x, y } = pointFromEvent(event);
    ctx?.beginPath();
    ctx?.moveTo(x, y);
    canvasEl.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function draw(event: PointerEvent): void {
    if (!drawing || !canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    const { x, y } = pointFromEvent(event);
    ctx?.lineTo(x, y);
    ctx?.stroke();
    event.preventDefault();
  }

  function endDraw(): void {
    drawing = false;
  }

  function clearCanvas(): void {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    ctx?.clearRect(0, 0, canvasEl.width, canvasEl.height);
    hasDrawn = false;
  }

  function startCapture(): void {
    editing = true;
    hasDrawn = false;
  }

  function cancelCapture(): void {
    editing = false;
    hasDrawn = false;
  }

  async function saveSignature(): Promise<void> {
    if (!canvasEl || !hasDrawn || saving) return;
    saving = true;
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvasEl!.toBlob(resolve, 'image/png'));
      if (!blob) return;
      await onSave(blob, nameInput.trim(), canvasEl.width, canvasEl.height);
      editing = false;
      hasDrawn = false;
    } finally {
      saving = false;
    }
  }

  async function removeSignature(): Promise<void> {
    if (
      !confirm(
        'Unterschrift wirklich entfernen? Der Bericht wird dadurch wieder bearbeitbar – eine neue Unterschrift muss danach erneut eingeholt werden.'
      )
    )
      return;
    await onClear();
  }
</script>

<div class="section">
  {#if !showPad && signatureUrl}
    <div class="saved">
      <img src={signatureUrl} alt="Unterschrift" />
      <p class="meta">
        {signedByName ? `Unterschrieben von ${signedByName}` : 'Unterschrieben'}
        {#if signedAt}· {formatDateTimeDE(signedAt)}{/if}
      </p>
      <div class="actions">
        <button type="button" class="delete" onclick={removeSignature}>Entfernen</button>
        <button type="button" class="primary" onclick={startCapture}>Neu unterschreiben</button>
      </div>
    </div>
  {:else}
    <label>
      Name (unterschrieben von)
      <input type="text" bind:value={nameInput} placeholder="Name des Unterzeichnenden" />
    </label>
    <canvas
      bind:this={canvasEl}
      class="pad"
      onpointerdown={startDraw}
      onpointermove={draw}
      onpointerup={endDraw}
      onpointercancel={endDraw}
      onpointerleave={endDraw}
    ></canvas>
    <p class="hint">Mit dem Finger oder der Maus unterschreiben.</p>
    <div class="actions">
      <button type="button" class="ghost" onclick={clearCanvas}>Löschen</button>
      {#if signatureBlob}
        <button type="button" class="ghost" onclick={cancelCapture}>Abbrechen</button>
      {/if}
      <button type="button" class="primary" onclick={saveSignature} disabled={!hasDrawn || saving}>
        Unterschrift speichern
      </button>
    </div>
  {/if}
</div>

<style>
  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  label {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }

  .pad {
    width: 100%;
    height: 220px;
    /* Bewusst FEST hell statt --color-surface: die Unterschrift wird als
       dunkle Tinte gezeichnet (setupCanvas() strokeStyle) - wie auf Papier
       unterschreiben soll das auch im Dunkel-Theme lesbar/gewohnt bleiben,
       statt dunkle Tinte auf dunklem Grund unsichtbar zu machen. */
    background: #ffffff;
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-md);
    touch-action: none;
  }

  .hint {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 0.8rem;
    text-align: center;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .ghost {
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-4);
    min-height: auto;
  }

  .primary {
    background: var(--color-primary);
    color: var(--color-primary-contrast);
    border: none;
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-4);
    min-height: auto;
    font-weight: 600;
  }

  .primary:disabled {
    opacity: 0.5;
  }

  .delete {
    background: transparent;
    border: 1px solid var(--color-danger);
    color: var(--color-danger);
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-4);
    min-height: auto;
  }

  .saved {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .saved img {
    width: 100%;
    max-height: 220px;
    object-fit: contain;
    /* Fest hell, aus demselben Grund wie .pad oben - die PNG-Unterschrift
       hat transparenten Hintergrund, nur die dunkle Tinte ist gezeichnet. */
    background: #ffffff;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }

  .meta {
    margin: 0;
    font-size: 0.85rem;
    color: var(--color-text-muted);
    text-align: center;
  }
</style>
