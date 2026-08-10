/**
 * Minimaler Debounce-Helfer für das Autosave-Verhalten: `run()` verzögert
 * den Aufruf, `flush()` führt einen ausstehenden Aufruf sofort aus (wichtig
 * bei `blur`/`visibilitychange`, da iOS Hintergrund-Tabs schnell einfriert),
 * `cancel()` verwirft einen ausstehenden Aufruf ohne ihn auszuführen.
 */
export function debounce(fn: () => void, waitMs: number): { run: () => void; flush: () => void; cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let pending = false;

  function run(): void {
    pending = true;
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = undefined;
      pending = false;
      fn();
    }, waitMs);
  }

  function flush(): void {
    if (!pending) return;
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = undefined;
    pending = false;
    fn();
  }

  function cancel(): void {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = undefined;
    pending = false;
  }

  return { run, flush, cancel };
}
