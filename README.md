# E-Servicebericht

Mobile-first Progressive Web App (PWA) zur schnellen Erfassung von Serviceberichten für Serviceeinsätze im Elektrohandwerk. Läuft im Browser (iPhone Safari, Android Chrome, Desktop) und lässt sich wie eine native App auf dem Homescreen installieren – ganz ohne App Store.

## Funktionen (MVP)

- **Projektnummer** je Servicebericht (Pflichtfeld), dazu optional Kurzbeschreibung, Kunde, Ansprechpartner beim Kunden, Techniker und Status (offen/abgeschlossen)
- **Tagesstempeluhr mit Leerlaufzeit-Tracking**: Oben in der Berichtsliste wird zunächst der ganze Arbeitstag ein-/ausgestempelt ("▶️ Tag einstempeln"/"⏹ Tag ausstempeln"), unabhängig von einem konkreten Projekt. Solange der Tag läuft, aber gerade in keinem Bericht eingecheckt ist, läuft die Zeit automatisch auf ein separates Konto **"Leerlaufzeit"** (Fahrten, Warten, Rüstzeiten, allgemeine Tätigkeiten). Der Wechsel zwischen Leerlaufzeit und einem Projekt (bzw. zwischen zwei Projekten) läuft über das gewohnte Ein-/Auschecken im jeweiligen Bericht (`TimeClock`) oder den "Direkt einchecken"-Schnellzugriff; es kann global immer nur ein Abschnitt gleichzeitig laufen (beim Wechsel zwischen zwei unterschiedlichen Projekten wird zur Sicherheit nachgefragt, beim Wechsel Leerlaufzeit↔Projekt nicht, da das der normale Ablauf ist). Solange der Tag läuft, zeigt eine "Heute bisher"-Kachel live die bereits angefallene Gesamt-/Projekt-/Leerlaufzeit (aktualisiert sich alle 30s, inkl. des gerade laufenden Abschnitts); nach dem Ausstempeln macht eine Tagesabschluss-Karte daraus den finalen Tages-Stand. Wird am selben Kalendertag mehrfach aus- und wieder eingestempelt, zählt die Tagesbilanz alle Zyklen dieses Tages zusammen – sie setzt sich erst am nächsten Kalendertag wieder auf 0 zurück. Begriffe sind bewusst getrennt: **ein-/ausstempeln** startet/beendet den Arbeitstag, **ein-/auschecken** wechselt in ein/aus einem Projekt
- **Eingecheckter Bericht angepinnt**: In der Berichtsliste steht der Bericht, in den gerade eingecheckt ist, immer ganz oben (unabhängig von der sonstigen Sortierung nach letzter Änderung) und ist farblich hervorgehoben (Rahmen/Hintergrund + "● Eingecheckt"-Badge) – auf einen Blick erkennbar, woran man gerade arbeitet
- **Leerlaufzeiten nachträglich zuordnen** (Menü → Leerlaufzeiten zuordnen): Alle abgeschlossenen, noch keinem Projekt zugeordneten Leerlaufzeit-Abschnitte lassen sich hier im Nachhinein einem (nicht gesperrten) Bericht zuweisen – was nicht zugeordnet wird, bleibt dauerhaft Leerlaufzeit
- **Statistik** (Menü → Statistik): Tages-/Monats-/Jahres-Auswertung von produktiver Zeit (einem Bericht zugeordnet) vs. Leerlaufzeit, jeweils mit Vor-/Zurück-Navigation zum gewünschten Zeitraum, Gesamt-/Produktiv-/Leerlaufzeit-Kachel samt Prozent-Balken sowie einer Tages- bzw. Monats-Aufschlüsselung zum Reintippen in einen einzelnen Tag/Monat. Basiert auf allen erfassten Zeiteinträgen (auch manuell im Zeiten-Tab nachgetragenen, nicht nur über die Tagesstempeluhr erfassten). Die Tagesansicht zeigt zusätzlich, an welchen Projekten an diesem Tag wie lange gearbeitet wurde, mit Direktsprung zum jeweiligen Bericht
- **Ein-/Auschecken pro Bericht**: Ein Tap startet einen laufenden Zeiteintrag (Startzeit = jetzt), ein weiterer Tap beendet ihn (Endzeit = jetzt, Dauer wird automatisch berechnet) und wechselt zurück auf Leerlaufzeit, falls der Tag noch läuft. Der entstandene Zeiteintrag lässt sich wie jeder andere im Zeiten-Tab manuell nachbearbeiten
- **Zeiten pro Tag** erfassen: Datum, Start-/Endzeit (Dauer wird automatisch berechnet – liegt die Endzeit vor der Startzeit, wird das als Zeitspanne über Mitternacht hinweg interpretiert, z.B. 19:05–12:16 → 17:11 Std., statt die Dauer zu verwerfen), optionale Notiz. Beim Speichern wird berichtsübergreifend auf Überschneidungen mit anderen Zeiteinträgen am selben Tag geprüft (man kann ja nicht gleichzeitig an zwei Orten arbeiten) – bei einer Überschneidung wird nachgefragt, ob wirklich so gespeichert werden soll, und optional angeboten, nur das überschneidende Zeitfenster bei den anderen Einträgen automatisch herauszuschneiden (statt sie komplett zu löschen): je nachdem wo sich die Zeiten überlappen, wird der jeweils andere Eintrag entsprechend gekürzt oder – falls der Ausschnitt mittendrin liegt – in zwei Teile gesplittet, der übrige (nicht überschneidende) Zeitraum bleibt dabei erhalten
- **Verbautes Material**: Bezeichnung, Menge, Einheit, optionale Artikelnummer – mit Autovervollständigung aus einem mitgelieferten Standard-Materialstamm für Elektroinstallation (`src/lib/materialCatalog.ts`) sowie bereits im Bericht verwendeten Bezeichnungen
- **Fotos** des Einsatzes über Kamera oder Fotobibliothek hochladen, mit Vollbild-Ansicht
- **Bericht sperren – mit oder ohne Unterschrift**: Ein Bericht lässt sich final abschließen und damit sperren (Kopfdaten, Notizen, Zeiten, Material und Fotos lassen sich danach nicht mehr ändern, eine laufende Stempeluhr wird automatisch beendet und wechselt dabei nahtlos auf Leerlaufzeit weiter – der Tagesstempel läuft also einfach weiter statt hängen zu bleiben –, der Status springt auf "Abgeschlossen") – auf zwei Wegen:
  - **Kunden-Unterschrift**: Im Tab "Unterschrift" unterzeichnet der Kunde vor Ort mit dem Finger oder der Maus auf einem Unterschriften-Pad (samt Name); das sperrt den Bericht automatisch mit
  - **Manuell durch den Monteur**: Über den Button "Ohne Unterschrift final abschließen", wenn keine Kundenunterschrift nötig oder möglich ist

  Sowohl in der Berichtsliste (Badge, plus Filter "Gesperrt" neben "Alle/Offen/Abgeschlossen") als auch im Bericht selbst wird "🔒 Unterschrieben" bzw. "🔒 Final abgeschlossen" als eigener, genauerer Status angezeigt statt nur "Abgeschlossen". Einziger Weg zurück zum Bearbeiten: die Sperre bewusst wieder aufheben (Button im Banner bzw. "Entfernen" im Unterschrift-Tab, jeweils mit Sicherheitsabfrage) – eine vorhandene Unterschrift geht dabei mit verloren und müsste neu eingeholt werden. Eine vorhandene Unterschrift erscheint im Word-Export als eigener Abschnitt am Ende des Dokuments
- **Export-Nachverfolgung**: Die Berichtsliste zeigt pro Bericht an, wann er zuletzt als Word-Dokument heruntergeladen/geteilt wurde ("📤 Exportiert am …"), und bietet einen Filter "Nicht exportiert" – damit lässt sich auf einen Blick erkennen, welche Berichte noch eingereicht werden müssen
- **Export als Word-Dokument (.docx)**: kompletter Bericht (Kopfdaten inkl. Kurzbeschreibung/Ansprechpartner, Zeiten-Tabelle, Material-Tabelle, Notizen, Fotos, Kunden-Unterschrift) als editierbare Datei mit farblichem Layout (Theme-Akzentfarbe, Tabellen-Header-Shading, Zebra-Streifen) – läuft rein clientseitig (kein Server), mit direktem Teilen über das iOS-Share-Sheet (Mail/WhatsApp/AirDrop), wenn verfügbar
- **Backup & Wiederherstellung**: Der komplette Datenbestand (alle Berichte, Zeiten, Material, Fotos) lässt sich über das Menü als eine JSON-Datei sichern ("Sicherung exportieren") und auf einem anderen Gerät/nach Datenverlust wieder einspielen ("Sicherung wiederherstellen") – wichtig, da alle Daten sonst ausschließlich lokal auf einem Gerät liegen. Vor dem Import wird eine Zusammenfassung angezeigt und um Bestätigung gebeten; vorhandene Berichte mit gleicher ID werden dabei überschrieben
- **Menü statt Icon-Reihe**: Statistik, Leerlaufzeiten zuordnen sowie Sicherung exportieren/wiederherstellen sind in der Berichtsliste über einen ☰-Button oben rechts erreichbar, der ein Popup-Menü mit Icon + Beschriftung je Punkt öffnet – statt vier einzelnen, nicht selbsterklärenden Icons
- **Autosave** – kein Speichern-Button nötig, Eingaben werden automatisch gesichert
- **Offlinefähig** – alle Daten liegen lokal auf dem Gerät (IndexedDB), keine Internetverbindung nötig
- **Installierbar** – "Zum Home-Bildschirm hinzufügen" für App-artiges Verhalten auf iOS/Android
- **Direkt einchecken**: Button in der Tagesstempeluhr öffnet zuerst eine Auswahl der noch offenen Berichte zum direkten Weiterarbeiten; passt keiner, legt "+ Neuen Bericht anlegen" wie gehabt mit nur der Projektnummer sofort einen neuen Bericht an (startet bei Bedarf transparent den Tagesstempel mit) – Kopfdaten lassen sich danach in Ruhe nachtragen. Gibt es zu der eingegebenen Projektnummer bereits einen offenen Bericht, wird der wiederverwendet statt ein Duplikat anzulegen (kurzer Hinweis, wohin man eingecheckt wurde); gibt es dazu nur bereits abgeschlossene/gesperrte Berichte (z.B. erneuter Einsatz bei wiederkehrendem Kunden), wird ein neuer angelegt und die Besuchsnummer eingeblendet ("2. Bericht zu diesem Projekt") – dauerhaft sichtbar auch als Badge in der Kopfzeile des Berichts selbst
- **Techniker-Name wird gemerkt**: Der zuletzt eingetragene Techniker-Name wird lokal auf dem Gerät gemerkt und bei jedem neuen Bericht automatisch vorausgefüllt – erspart wiederholtes Eintippen
- **Kopfdaten einklappbar**: Ein bereits angelegter Bericht zeigt Projektnummer/Kunde zunächst nur als kompakte, antippbare Kopfzeile – mehr Platz für Zeiten/Material/Fotos auf kleinen Bildschirmen; ein Tap klappt die vollen Kopfdaten bei Bedarf wieder auf
- **Suche in der Berichtsliste**: Textsuche über Projektnummer und Kunde, zusätzlich zu den Status-Filtern

Aktuell bewusst außerhalb des Umfangs: PDF-Export, Login/Mehrbenutzer-Verwaltung, Cloud-Sync, sowie bei der Tagesstempeluhr (Phase 1+2 umgesetzt): Export der Statistik als Word/PDF, automatischer Pausenabzug nach §4 ArbZG und Fahrtzeiten-/km-Erfassung – geplant als spätere Ausbaustufen. Das Datenmodell ist aber so aufgebaut, dass sich das später ergänzen lässt, ohne die App umzubauen.

## Design

Die App wird schrittweise nach einem Moodboard überarbeitet. **Runde 1 (umgesetzt):**
- Neue Farbpalette als CSS-Variablen in `src/app.css` (Akzent `#2563EB`, Erfolg `#16A34A`, Text/Hintergrund-Töne), durchgängig angewendet (Buttons, FAB, Filter-Chips, PWA-Theme-Farbe, Word-Export-Akzentfarbe, App-Icon)
- [Inter](https://rsms.me/inter/) als Schriftart – selbst gehostet als Variable-Font-Datei (`src/assets/fonts/`, ~48 KB, deckt alle Schriftschnitte ab), bewusst **nicht** über Google Fonts CDN eingebunden, damit sie auch offline zuverlässig lädt (wird vom Service Worker mit vorgecacht)
- Globale Überschriften-Skala (h1/h2/h3) als Basis für neue Screens

**Runde 2 (geplant):** ein durchgängiges Icon-Set anstelle der aktuellen Emoji-Icons sowie ein Feinschliff der Status-/Badge-Farbsemantik (Offen/Unterschrieben/Final abgeschlossen/Nicht exportiert).

## Tech-Stack

- [Vite](https://vitejs.dev/) + [Svelte 5](https://svelte.dev/) + TypeScript
- [`idb`](https://github.com/jakearchibald/idb) als schlanker IndexedDB-Wrapper (lokale Datenhaltung, kein Backend)
- [`docx`](https://github.com/dolanmiu/docx) für den clientseitigen Word-Export (per dynamischem Import nachgeladen, nicht im Hauptbundle)
- [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/) für Manifest + Service Worker (Workbox)
- [Inter](https://rsms.me/inter/) (selbst gehostete Variable-Font) als Schriftart
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
      types.ts, client.ts, summary.ts, backup.ts
      reports.ts, timeEntries.ts, materialItems.ts, photos.ts
    export/                        # Word-Export: getFullReport.ts (Daten aggregieren), docxExport.ts (Dokument bauen)
    backup/                         # backupFile.ts: Sicherungsdatei bauen/einlesen (Fotos base64-kodiert)
    components/                   # UI-Bausteine (Zeiten/Material/Fotos-Sektionen, PWA-Hinweise, …)
    utils/                          # Datum/Dauer-Formatierung, Debounce, Thumbnail-Erzeugung
    materialCatalog.ts               # Standard-Materialstamm für die Bezeichnung-Autovervollständigung
    router.svelte.ts                # Minimaler Hash-Router (kein zusätzliches npm-Paket nötig)
  tests/                            # Vitest-Tests für Datenzugriffsschicht, Export und Backup
```

Die UI greift nie direkt auf `idb` zu, sondern ausschließlich über die Funktionen in `src/lib/db/*.ts`. Das hält die Komponenten einfach und erlaubt es später, die lokale Implementierung z.B. durch ein synchronisierendes Backend zu ersetzen, ohne den UI-Code anzufassen.

## Daten & Datenschutz

Alle Berichte, Zeiten, Materialpositionen und Fotos werden ausschließlich lokal im Browser-Speicher (IndexedDB) des jeweiligen Geräts abgelegt – es gibt (noch) keinen Server und keine Cloud-Synchronisation. Das bedeutet auch: Die Daten sind aktuell an das jeweilige Gerät/den jeweiligen Browser gebunden und nicht automatisch zwischen mehreren Geräten verfügbar.
