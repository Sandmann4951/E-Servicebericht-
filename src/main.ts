import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import { initTheme } from './lib/theme.svelte';

// Vor dem ersten Svelte-Mount aufrufen (das Inline-Script in index.html
// <head> hat das data-theme-Attribut zu diesem Zeitpunkt schon gesetzt,
// um einen Hell-Flash bei Dunkel-Systemeinstellung zu vermeiden - hier wird
// nur noch der reaktive Svelte-State synchron dazu initialisiert).
initTheme();

const target = document.getElementById('app');
if (!target) {
  throw new Error('Root element #app nicht gefunden');
}

const app = mount(App, { target });

export default app;
