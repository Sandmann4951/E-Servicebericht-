/**
 * Hell-/Dunkel-Theme-Umschaltung. Folgt demselben schlanken Muster wie
 * router.svelte.ts: ein modul-weiter $state-Wert, den jede Komponente
 * reaktiv lesen kann, plus einfache Funktionen zum Ändern. Kein zusätzliches
 * State-Management-Paket nötig.
 *
 * Alle Farben laufen über CSS Custom Properties in src/app.css
 * (`:root` = Hell, `:root[data-theme="dark"]` = Dunkel/Lime) - dieses Modul
 * setzt/liest nur, WELCHES Theme aktiv ist, nicht die Farben selbst.
 */

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'e-servicebericht:theme';

const THEME_COLOR: Record<Theme, string> = { light: '#2563eb', dark: '#0a0a0a' };

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

function readStoredTheme(): Theme | undefined {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : undefined;
  } catch {
    // localStorage evtl. nicht verfügbar (z.B. Safari Private Mode) - dann
    // gilt einfach kein gespeicherter Wert, kein harter Fehler.
    return undefined;
  }
}

/** Gespeicherte Nutzerwahl hat Vorrang; ohne sie zählt einmalig die Systemeinstellung. */
function resolveInitialTheme(): Theme {
  return readStoredTheme() ?? (systemPrefersDark() ? 'dark' : 'light');
}

export const themeState = $state<{ mode: Theme }>({ mode: resolveInitialTheme() });

function applyToDocument(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
}

/**
 * Einmal beim App-Start aufrufen (main.ts, vor dem Svelte-Mount). Das
 * Inline-Script in index.html <head> setzt `data-theme` zwar schon vorher
 * (verhindert einen Hell-Flash bevor das JS-Bundle lädt, siehe Kommentar
 * dort) - hier wird nur derselbe Zustand zusätzlich ins reaktive
 * `themeState` gespiegelt und die Meta-Theme-Color synchron gesetzt.
 */
export function initTheme(): void {
  applyToDocument(themeState.mode);
}

export function setTheme(theme: Theme): void {
  themeState.mode = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // s.o. - Theme gilt dann nur für diese Session, kein harter Fehler.
  }
  applyToDocument(theme);
}

export function toggleTheme(): void {
  setTheme(themeState.mode === 'dark' ? 'light' : 'dark');
}
