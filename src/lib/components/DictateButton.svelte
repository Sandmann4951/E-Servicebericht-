<script lang="ts">
  /**
   * Mikrofon-Knopf zum Diktieren in ein Textfeld - nutzt die im Gerät
   * eingebaute Spracherkennung (Web Speech API), deshalb ohne eigene
   * Bibliothek und ohne Kosten. Erscheint nur, wenn der Browser sie
   * anbietet. Fertig erkannte Textbausteine gehen über `onText` an das
   * jeweilige Feld (siehe utils/dictation.ts appendDictatedText()).
   */
  import Icon from './Icon.svelte';

  let { onText, disabled = false }: { onText: (text: string) => void; disabled?: boolean } = $props();

  interface RecognitionResult {
    isFinal: boolean;
    0: { transcript: string };
  }
  interface RecognitionEvent {
    resultIndex: number;
    results: ArrayLike<RecognitionResult>;
  }
  interface Recognition {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    onresult: ((event: RecognitionEvent) => void) | null;
    onerror: ((event: { error: string }) => void) | null;
    onend: (() => void) | null;
    start(): void;
    stop(): void;
    abort(): void;
  }
  type RecognitionCtor = new () => Recognition;

  const Ctor: RecognitionCtor | undefined =
    typeof window === 'undefined'
      ? undefined
      : ((window as unknown as { SpeechRecognition?: RecognitionCtor }).SpeechRecognition ??
        (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition);

  let listening = $state(false);
  let error = $state<string | undefined>();
  let recognition: Recognition | undefined;

  function describeError(code: string): string | undefined {
    if (code === 'no-speech' || code === 'aborted') return undefined;
    if (code === 'not-allowed' || code === 'service-not-allowed') return 'Mikrofon-Zugriff nicht erlaubt.';
    if (code === 'network') return 'Spracherkennung braucht eine Internetverbindung.';
    return 'Spracherkennung nicht verfügbar.';
  }

  function toggle(): void {
    if (!Ctor) return;
    if (listening) {
      recognition?.stop();
      return;
    }
    error = undefined;
    const instance = new Ctor();
    instance.lang = 'de-DE';
    instance.continuous = true;
    instance.interimResults = false;
    instance.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) onText(result[0].transcript);
      }
    };
    instance.onerror = (event) => {
      error = describeError(event.error);
    };
    instance.onend = () => {
      listening = false;
      recognition = undefined;
    };
    try {
      instance.start();
      recognition = instance;
      listening = true;
    } catch {
      error = 'Spracherkennung nicht verfügbar.';
    }
  }

  $effect(() => {
    return () => recognition?.abort();
  });
</script>

{#if Ctor}
  <button
    type="button"
    class="dictate-btn"
    class:listening
    onclick={toggle}
    {disabled}
    aria-pressed={listening}
    aria-label={listening ? 'Diktat beenden' : 'Text diktieren'}
    title={error ?? (listening ? 'Diktat beenden' : 'Text diktieren')}
  >
    <Icon name="mic" size={16} />
    {#if listening}<span>Stopp</span>{/if}
  </button>
  {#if error}<span class="dictate-error" role="status">{error}</span>{/if}
{/if}

<style>
  .dictate-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: auto;
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text-muted);
    font-size: 0.75rem;
    font-weight: 600;
  }

  .dictate-btn.listening {
    background: var(--color-danger);
    border-color: var(--color-danger);
    color: var(--color-primary-contrast);
    animation: dictate-pulse 1.4s ease-in-out infinite;
  }

  .dictate-btn:disabled {
    opacity: 0.5;
  }

  .dictate-error {
    font-size: 0.75rem;
    color: var(--color-danger);
  }

  @keyframes dictate-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.65;
    }
  }
</style>
