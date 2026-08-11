# E-Servicebericht

Mobile-first Progressive Web App (PWA) zur schnellen Erfassung von Serviceberichten für Serviceeinsätze im Elektrohandwerk. Läuft im Browser (iPhone Safari, Android Chrome, Desktop) und lässt sich wie eine native App auf dem Homescreen installieren – ganz ohne App Store.

## Funktionen (MVP)

- **Projektnummer** je Servicebericht (Pflichtfeld), dazu optional Kurzbeschreibung, Kunde, Ansprechpartner beim Kunden, Techniker und Status (offen/abgeschlossen)
- **Ein-/Ausstempeln**: Ein Tap startet einen laufenden Zeiteintrag (Startzeit = jetzt), ein weiterer Tap beendet ihn (Endzeit = jetzt, Dauer wird automatisch berechnet). Der entstandene Zeiteintrag lässt sich wie jeder andere im Zeiten-Tab manuell nachbearbeiten
- **Zeiten pro Tag** erfassen: Datum, Start-/Endzeit (Dauer wird automatisch berechnet), optionale Notiz
- **Verbautes Material**: Bezeichnung, Menge, Einheit, optionale Artikelnummer – mit Autovervollständigung aus einem mitgelieferten Standard-Materialstamm für Elektroinstallation (`src/lib/materialCatalog.ts`) sowie bereits im Bericht verwendeten Bezeichnungen
- **Fotos** des Einsatzes über Kamera oder Fotobibliothek hochladen, mit Vollbild-Ansicht
- **Export als Word-Dokument (.docx)**: kompletter Bericht (Kopfdaten inkl. Kurzbeschreibung/Ansprechpartner, Zeiten-Tabelle, Material-Tabelle, Notizen, Fotos) als editierbare Datei mit farblichem Layout (Theme-Akzentfarbe, Tabellen-Header-Shading, Zebra-Streifen) – läuft rein clientseitig (kein Server), mit direktem Teilen über das iOS-Share-Sheet (Mail/WhatsApp/AirDrop), wenn verfügbar
- **Autosave** – kein Speichern-Button nötig, Eingaben werden automatisch gesichert
- **Offlinefähig** – alle Daten liegen lokal auf dem Gerät (IndexedDB), keine Internetverbindung nötig
- **Installierbar** – "Zum Home-Bildschirm hinzufügen" für App-artiges Verhalten auf iOS/Android

Aktuell bewusst außerhalb des Umfangs: Backup/Wiederherstellung als Datei, Kunden-Unterschrift im Bericht, PDF-Export, Login/Mehrbenutzer-Verwaltung, Cloud-Sync. Das Datenmodell ist aber so aufgebaut, dass sich das später ergänzen lässt, ohne die App umzubauen.

## Tech-Stack

- [Vite](https://vitejs.dev/) + [Svelte 5](https://svelte.dev/) + TypeScript
- [`idb`](https://github.com/jakearchibald/idb) als schlanker IndexedDB-Wrapper (lokale Datenhaltung, kein Backend)
- [`docx`](https://github.com/dolanmiu/docx) für den clientseitigen Word-Export (per dynamischem Import nachgeladen, nicht im Hauptbundle)
- [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/) für Manifest + Service Worker (Workbox)
- [Vitest](https://vitest.dev/) + [`fake-indexeddb`](https://github.com/dumbmatter/fakeIndexedDB) für die Tests der Datenzugriffsschicht

## Entwicklung

```bash
npm install
npm run dev        # Dev-Server unter http://localhost:5173
```

### Auf einem echten iPhone testen

iOS Safari verlangt für Service Worker/Kamera-Zugriff einen sicheren Kontext (HTTPS oder `localhost`). Für Tests im heimischen WLAN über die LAN-IP steht ein zweiter Dev-Befehl mit automatisch erzeugtem, vertrauenswürdigem Zertifikat (via `vite-plugin-mkcert`) bereit:

```bash
npm run dev:iphone
```

Die angezeigte `https://<LAN-IP>:5173`-Adresse dann auf dem iPhone im selben WLAN in Safari öffnen. Über **Teilen → Zum Home-Bildschirm hinzufügen** lässt sich die App wie eine native App installieren (App-Icon, Start ohne Safari-Oberfläche, Offline-Start).

> Hinweis: Beim allerersten Aufruf lädt `mkcert` einmalig einen Zertifikats-Helper aus dem Internet nach. Daher ist dieser Modus nicht Teil von `npm run dev`/`build`/`check`, damit diese Befehle nie von einem Netzwerkzugriff abhängen.

### Weitere Befehle

```bash
npm run build       # Produktions-Build nach dist/ (inkl. Service Worker/Manifest)
npm run preview      # Gebauten Build lokal ausliefern
npm run check         # Typ-/Svelte-Check (svelte-check)
npm test               # Unit-Tests einmalig ausführen (vitest run)
npm run test:watch  # Unit-Tests im Watch-Modus
```

## Projektstruktur

```
src/
  main.ts, App.svelte, app.css   # Einstiegspunkt, Root-Layout, globale Styles
  routes/
    ReportList.svelte             # Startseite: Liste aller Berichte
    ReportDetail.svelte           # Bericht anlegen/ansehen/bearbeiten
  lib/
    db/                            # IndexedDB-Datenzugriffsschicht (Repository-Pattern)
      types.ts, client.ts, summary.ts
      reports.ts, timeEntries.ts, materialItems.ts, photos.ts
    export/                        # Word-Export: getFullReport.ts (Daten aggregieren), docxExport.ts (Dokument bauen)
    components/                   # UI-Bausteine (Zeiten/Material/Fotos-Sektionen, PWA-Hinweise, …)
    utils/                          # Datum/Dauer-Formatierung, Debounce, Thumbnail-Erzeugung
    materialCatalog.ts               # Standard-Materialstamm für die Bezeichnung-Autovervollständigung
    router.svelte.ts                # Minimaler Hash-Router (kein zusätzliches npm-Paket nötig)
  tests/                            # Vitest-Tests für Datenzugriffsschicht und Export
```

Die UI greift nie direkt auf `idb` zu, sondern ausschließlich über die Funktionen in `src/lib/db/*.ts`. Das hält die Komponenten einfach und erlaubt es später, die lokale Implementierung z.B. durch ein synchronisierendes Backend zu ersetzen, ohne den UI-Code anzufassen.

## Daten & Datenschutz

Alle Berichte, Zeiten, Materialpositionen und Fotos werden ausschließlich lokal im Browser-Speicher (IndexedDB) des jeweiligen Geräts abgelegt – es gibt (noch) keinen Server und keine Cloud-Synchronisation. Das bedeutet auch: Die Daten sind aktuell an das jeweilige Gerät/den jeweiligen Browser gebunden und nicht automatisch zwischen mehreren Geräten verfügbar.
