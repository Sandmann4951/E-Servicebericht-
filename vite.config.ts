import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import mkcert from 'vite-plugin-mkcert';

// https://vitejs.dev/config/
// mkcert lädt beim ersten Aufruf einen Zertifikats-Helper von GitHub nach -
// das darf niemals Build/Typecheck/CI blockieren (z.B. hinter einem Proxy
// ohne GitHub-Zugriff). Daher nur aktiv, wenn explizit per
// `npm run dev:iphone` angefordert (siehe package.json).
const useMkcert = process.env.VITE_USE_MKCERT === '1';

// Für ein GitHub-Pages-Projekt-Deployment liegt die App unter einem
// Unterpfad (https://<user>.github.io/<repo>/), nicht an der Domain-Wurzel.
// Der Deploy-Workflow setzt VITE_BASE_PATH entsprechend; lokal (npm run dev
// /build) bleibt es bei "/".
const basePath = process.env.VITE_BASE_PATH || '/';

export default defineConfig(() => ({
  base: basePath,
  plugins: [
    svelte(),
    useMkcert && mkcert(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'E-Servicebericht',
        short_name: 'Servicebericht',
        description: 'Digitale Serviceberichte für Elektrohandwerk-Serviceeinsätze',
        lang: 'de',
        start_url: basePath,
        scope: basePath,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#0b5fff',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}']
      },
      devOptions: {
        enabled: true,
        type: 'module'
      }
    })
  ],
  server: {
    host: true
  }
}));
