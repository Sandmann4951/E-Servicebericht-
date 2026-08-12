/**
 * Sehr schlanker Hash-Router für die zwei Screens der App
 * (Liste + Detail). Kein zusätzliches npm-Paket nötig - Hash-Routing
 * funktioniert 100% statisch (wichtig für den Service Worker/App-Shell-
 * Precaching) und übersteht Reloads/Homescreen-Start ohne Server-Rewrites.
 */

function readHash(): string {
  if (typeof window === 'undefined') return '/';
  return window.location.hash.slice(1) || '/';
}

export const router = $state({ path: readHash() });

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    router.path = readHash();
  });
}

/** Navigiert zu einem neuen Pfad (z.B. "/reports/abc-123"). */
export function navigate(path: string, options: { replace?: boolean } = {}): void {
  if (typeof window === 'undefined') return;
  if (options.replace) {
    const url = new URL(window.location.href);
    url.hash = path;
    window.history.replaceState(null, '', url);
    router.path = path;
  } else {
    window.location.hash = path;
  }
}

export type Route = { name: 'list' } | { name: 'detail'; id: string } | { name: 'leerlaufzeiten' };

export function parseRoute(path: string): Route {
  const detailMatch = /^\/reports\/([^/]+)\/?$/.exec(path);
  if (detailMatch) {
    return { name: 'detail', id: decodeURIComponent(detailMatch[1]) };
  }
  if (/^\/leerlaufzeiten\/?$/.exec(path)) {
    return { name: 'leerlaufzeiten' };
  }
  return { name: 'list' };
}
