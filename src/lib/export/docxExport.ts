import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import templateUrl from '../../assets/templates/servicebericht-vorlage.docx';
import type { MaterialItem, Photo, ServiceReport } from '../db/types';
import { splitContactPersonAndPhone } from '../utils/contactPerson';
import { formatDateDE, todayISODate } from '../utils/date';
import type { FullReport } from './getFullReport';
import { buildTimesheetRows } from './timesheetRows';

/**
 * Word-Export auf Basis der offiziellen ELSA-Servicebericht-Vorlage (vom
 * Kunden als .docx geliefert, V2026-05-21) statt eines eigenen,
 * programmatisch gebauten Layouts (so wie vor diesem Umbau, via der
 * `docx`-Bibliothek - inzwischen entfernt). Zweck: der exportierte
 * Bericht soll exakt wie das offizielle Formular aussehen, nur mit den in
 * Rivo erfassten Daten befüllt - "Formatierung darf sich nicht ändern,
 * nur die vorhandenen Daten in die dafür vorgesehenen Felder eintragen"
 * (ausdrücklicher Wunsch des Kunden).
 *
 * MECHANISMUS (zweistufig):
 *
 * 1) EINMALIGE Vorbereitung (nicht Teil dieses Moduls, nicht zur
 *    Laufzeit): In der Originaldatei sind die Eingabefelder als
 *    klassische Word-"Legacy-Formularfelder" (FORMTEXT-Felder, erkennbar
 *    an `<w:fldChar w:fldCharType="...">`) angelegt - kein Freitext. Ein
 *    separates Python-Skript hat deren Werte-Runs (zwischen
 *    `fldCharType="separate"` und `fldCharType="end"`) durch
 *    docxtemplater-Tags (`{projectNumber}`, `{customer}`, ...) ersetzt -
 *    dabei wurde NUR der Text-Inhalt des jeweils ersten Platzhalter-Runs
 *    ausgetauscht, seine `rPr` (Schriftart/-größe/Unterstreichung etc.)
 *    1:1 übernommen. Dadurch sieht ein eingetragener Wert exakt so aus
 *    wie vorher die Formularfeld-Markierung - keine einzige
 *    Formatierungseigenschaft wurde angefasst. Das Ergebnis liegt als
 *    `src/assets/templates/servicebericht-vorlage.docx` im Projekt.
 *    Material-Positionen laufen dabei über einen docxtemplater-
 *    Zeilen-Loop (`{#materials}`/`{/materials}` in der ersten/letzten
 *    Zelle der einzigen Beispielzeile) - die Zeile wird beim Rendern pro
 *    Position automatisch dupliziert/entfernt. Die ERSTE Zelle dient
 *    gleichzeitig als "Lager (L) / Bestellung (B)"-Spalte - ihr einziger
 *    Werte-Run enthält `{source}{#materials}` (Wert-Tag direkt vor dem
 *    Loop-Start-Tag im selben Run, exakt wie bei `{quantityUnit}{/materials}`
 *    in der letzten Zelle), da diese Spalte sonst keinen eigenen Platz für
 *    den Loop-Marker gehabt hätte.
 *
 * 2) Export zur Laufzeit (dieses Modul): lädt die vorbereitete Vorlage,
 *    rendert sie mit `docxtemplater` anhand der Berichtsdaten.
 *
 * ANSPRECHPARTNER/TELEFON: Die Vorlage hat für "Ansprechpartner vor Ort"
 * und "Telefonnummer:" zwei GETRENNTE Felder (`{contactPerson}`/
 * `{contactPhone}`) - entsprechend auch in Rivo zwei getrennte Felder auf
 * `ServiceReport` (`contactPerson`/`contactPhone`). Ältere, vor Einführung
 * von `contactPhone` angelegte Berichte haben die Telefonnummer noch ins
 * `contactPerson`-Textfeld gemergt ("Name (Tel. 0123...)") -
 * `splitContactPersonAndPhone()` (siehe utils/contactPerson.ts - auch von
 * der Unterschrift-Vorausfüllung in ReportDetail.svelte genutzt, damit
 * dieselbe Erkennung nicht doppelt existiert) erkennt dieses Altformat rein
 * für die Darstellung per Regex und trennt es wieder auf, OHNE die
 * gespeicherten Daten selbst zu verändern.
 *
 * FOTOS - EIGENER WEG, KEIN BILD-MODUL: Jede der 10 nummerierten
 * Dokumentations-Zeilen (1.-10., harte Obergrenze aus dem
 * Vorlagen-Layout) hat in der Originaldatei bereits eine eigene, vom
 * Vorlagen-Autor angelegte Word-"Bild-Inhaltssteuerung" (`<w:sdt>` mit
 * Platzhalterbild, alle 10 über dieselbe Relationship-ID `rId22`
 * verknüpft) als dafür vorgesehenen Platz - das ist eleganter als ein
 * zusätzliches Feld einzufügen. `docxtemplater-image-module-free` (der
 * einzige gepflegte freie Bild-Modul-Kandidat) erwies sich dabei als
 * inkompatibel mit aktuellen docxtemplater-Versionen (wirft
 * `Cannot read properties of undefined (reading 'length')` beim Rendern,
 * selbst in einem isolierten Minimal-Test - das Modul ist seit Jahren
 * nicht mehr gepflegt und gegen eine sehr viel ältere docxtemplater-Version
 * gebaut) und hätte zusätzlich eine stark veraltete, mehrfach kritisch
 * verwundbare `xmldom`-Abhängigkeit mitgebracht. Deshalb übernimmt
 * `injectPhotos()` unten das Einfügen von Hand: nach dem reinen
 * Text-Rendering werden die ersten `photos.length` (max. 10) Vorkommen
 * von `r:embed="rId22"` in Dokumentreihenfolge (= Zeile 1, 2, 3, ...)
 * durch eine neue, pro Foto eigene Relationship ersetzt (inkl. Foto-Datei
 * in `word/media/`, Eintrag in `word/_rels/document.xml.rels` und bei
 * Bedarf einer neuen `Default Extension` in `[Content_Types].xml`) -
 * sowie Breite/Höhe des zugehörigen `<w:drawing>`-Blocks proportional an
 * die tatsächliche Fotogröße angepasst (begrenzt auf die ursprüngliche
 * Platzhalter-Boxgröße, s. PHOTO_BOX_MAX_PX, damit sich die Zeilenhöhe
 * der Tabelle nicht unerwartet ändert). Nicht befüllte Zeilen (weniger
 * als 10 Fotos im Bericht) behalten bewusst das Platzhalterbild - exakt
 * das Verhalten, das auch beim manuellen Ausfüllen der Vorlage in Word
 * entstünde. Die "Beschreibung"-Spalte derselben Zeile zeigt `photo.note`
 * (eigene, pro Foto unabhängige Notiz, siehe PhotoSection.svelte) - ohne
 * eingetragene Notiz bleibt die Spalte bewusst leer (kein Zeitstempel-
 * Fallback mehr, ausdrücklicher Nutzerwunsch).
 *
 * ZEITEN: Die "Zeiten"-Tabelle war ursprünglich ein eingebettetes
 * Excel-Arbeitsblatt (OLE-Objekt). Auf Nutzerwunsch wurde es in der Vorlage
 * durch eine normale Word-Tabelle mit denselben Spalten ersetzt (Datum,
 * Techniker, Anfahrt Fahrzeit/Km, Arbeitszeit von/bis/Stunden/Ü-Std./Pause,
 * Abfahrt Fahrzeit/Km, darunter "Gesamt:"). Die Datenzeile ist ein
 * docxtemplater-Zeilen-Loop (`{#timeRows}` ... `{/timeRows}`), die
 * Gesamt-Zeile nutzt `{total...}`-Tags. Alle Werte rechnet die App selbst
 * (siehe timesheetRows.ts), es gibt also keine Formeln mehr, die erst in
 * Excel neu berechnet werden müssten, und keine Obergrenze an Zeilen.
 *
 * UNTERSCHRIFT: Die Vorlage sieht für die Kunden-Unterschrift nur eine
 * Zeile für den gedruckten Namen vor ("Namen in Druckschrift (Für
 * Unterschrift)"), keinen Platz für ein Bild - deshalb wird hier bewusst
 * NUR `signedByName` eingetragen, die tatsächliche Unterschrift-Grafik
 * vom Unterschriften-Pad erscheint in diesem Export nicht (ausdrücklich
 * so vom Kunden bestätigt, um das Vorlagen-Layout nicht zu verändern).
 *
 * DURCHGEFÜHRTE ARBEITEN: Eigenes `ServiceReport.performedWork`-Feld (in
 * der App eigenständig neben "Notizen"), füllt "Durchgeführte Arbeiten:".
 *
 * NOTIZEN → "INTERNER BERICHT" (URSPRÜNGLICH VERSTECKTER TEXT, AUF
 * NUTZERWUNSCH JETZT SICHTBAR): Das allgemeine `notes`-Feld landet in der
 * inhaltlich passenden Vorlagen-Stelle, "Interner Bericht/Bemerkungen/
 * Ersatzteilnummern:". Diese war im Original-Vorlagen-Quelltext als
 * VERSTECKTER Text angelegt (`w:vanish` auf Label UND Wertfeld, rot/fett/
 * kursiv im Quelltext) - eine frühere, eigene Design-Entscheidung dieser
 * Session, passend zum Feldnamen "Interner Bericht" interpretiert. Der
 * Nutzer hat das per Rückfrage korrigiert: der eingetragene Notizen-Text
 * soll normal sichtbar im Dokument erscheinen. `w:vanish` wurde deshalb aus
 * ALLEN rPr-Blöcken entfernt, die zu diesem Feld gehören - sowohl beim
 * Label-Run ("Interner Bericht/...") als auch bei jedem Run des Wertfelds
 * (inkl. der Absatzmarken-rPr in `w:pPr`, die Word sonst weiter als
 * "versteckter Absatz" behandeln würde) - alle übrigen Formatierungs-
 * eigenschaften (Schriftart, Größe, Farbe, Fett/Kursiv) bleiben unverändert.
 *
 * ORT/DATUM (FUSSZEILE): Der Vorlagen-Tag für dieses Feld enthält den
 * festen ELSA-Firmenstandort ("Kirchheim bei München, ") bereits als
 * Literal-Text direkt neben dem `{exportDate}`-Tag (kein eigenes
 * `location`-Datenfeld nötig) - `exportDate` ist das heutige Datum zum
 * Zeitpunkt des Exports (nicht `report.createdAt`), mit `formatDateDE()`
 * formatiert.
 *
 * WEITERE VORLAGENFELDER (Objektadresse/Einsatzort, E-Mail, Bestellnummer/
 * AB, Mehrungen, Festgestellte Mängel, Angebot benötigt für, Anlagenstatus,
 * Auftrag/Art des Auftrags, Sicherheitseinrichtungen, Übernachtung(en),
 * Folgeeinsatz): waren bis zu dieser Erweiterung mangels Rivo-Daten leer
 * gelassene, noch unangetastete Legacy-FORMTEXT- bzw. Dropdown-
 * Inhaltssteuerungsfelder der Vorlage - jeweils per `ServiceReport`-Feld
 * gleichen thematischen Namens befüllt (siehe db/types.ts). `plantStatus`/
 * `orderType` nutzen bewusst EXAKT die von der Vorlage selbst vorgegebenen
 * Dropdown-Optionen statt eigens erfundener Werte; `securityEquipmentOk`
 * schreibt "i.O."/"n.i.O." (ebenfalls Vorlagen-eigene Werte statt "Ja"/
 * "Nein"), `followUpVisitNeeded` schreibt "Ja"/"Nein". "Angebot benötigt
 * für:" bekommt bei `quoteNeeded === true` den Freitext (`quoteNeededFor`),
 * bei `false` den Text "Nein" (unterscheidbar von `undefined` = noch nicht
 * beantwortet, bleibt leer). Der Serviceauftrag-PDF-Parser erkennt keine
 * Bestellnummer im ELSA-PDF-Format (geprüft, siehe `orderNumber` in
 * db/types.ts) - bleibt deshalb ein rein manuelles Feld. NICHT implementiert
 * (bewusst nicht ohne Rückfrage erfunden): "Bericht-Nr." (keine
 * entsprechenden Daten in Rivo), "Hotelkosten:" (direkt neben
 * "Übernachtung(en):", bisher ebenfalls leer) und die separate "Kunde
 * wünscht:"-Dropdown-Auswahl (Angebot/Kein Angebot/Rückruf, bisher
 * ebenfalls leer, thematisch nah an "Angebot benötigt für:", aber ein
 * eigenständiges Vorlagenfeld).
 */

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Harte Obergrenze aus dem Vorlagen-Layout: genau 10 nummerierte Dokumentations-Zeilen (1.-10.), nicht änderbar ohne das Layout selbst zu verändern. */
const MAX_PHOTOS = 10;

/** Breite/Höhe der ursprünglichen Platzhalter-Bildbox in der Vorlage (1524000 EMU ÷ 9525 = 160px bei 96dpi) - als Obergrenze für eigene Fotos übernommen. */
const PHOTO_BOX_MAX_PX = 160;
const EMU_PER_PX = 9525;

/** Relationship-ID des in der Vorlage 10-fach wiederverwendeten Platzhalterbilds (siehe Dateikommentar oben). */
const PLACEHOLDER_REL_ID = 'rId22';

/** "L"/"B" - exakt die Buchstaben, die die Vorlage selbst als Spaltenbezeichnung ("Lager (L) / Bestellung (B)") nutzt; leer wenn nicht gesetzt. */
function materialSourceLetter(item: MaterialItem): string {
  if (item.source === 'lager') return 'L';
  if (item.source === 'bestellung') return 'B';
  return '';
}

function materialRowData(item: MaterialItem): { articleNumber: string; description: string; quantityUnit: string; source: string } {
  return {
    articleNumber: item.articleNumber ?? '',
    description: item.description,
    quantityUnit: `${item.quantity} ${item.unit}`,
    source: materialSourceLetter(item)
  };
}

function buildTemplateData(data: FullReport): Record<string, unknown> {
  const { report, materialItems, photos } = data;
  const { contactPerson, contactPhone } = splitContactPersonAndPhone(report);
  const templateData: Record<string, unknown> = {
    projectNumber: report.projectNumber,
    customer: report.customer ?? '',
    technicianName: report.technicianName ?? '',
    // Dieselbe Angabe wie `technicianName` - die Vorlage hat sowohl bei
    // "Berichtersteller" (Kopfdaten) als auch bei "Techniker"
    // (Unterschriftenzeile) ein eigenes Feld für denselben Namen.
    technicianNameSignature: report.technicianName ?? '',
    contactPerson,
    contactPhone,
    projectDescription: report.projectDescription ?? '',
    performedWork: report.performedWork ?? '',
    notes: report.notes ?? '',
    signedByName: report.signedByName ?? '',
    // Fester Firmenstandort (ELSA-Sitz, nicht der Einsatzort) + das heutige
    // Datum (Tag des tatsächlichen Exports, nicht report.createdAt) für das
    // "Ort/Datum"-Fußzeilenfeld - der feste Ortstext ist bereits Teil des
    // Vorlagen-Tags selbst ("Kirchheim bei München, {exportDate}"), hier
    // wird nur das Datum eingesetzt.
    exportDate: formatDateDE(todayISODate()),
    materials: materialItems.map(materialRowData),
    objectAddress: report.objectAddress ?? '',
    contactEmail: report.contactEmail ?? '',
    orderNumber: report.orderNumber ?? '',
    additionalWorkNotes: report.additionalWorkNotes ?? '',
    deficiencies: report.deficiencies ?? '',
    // `quoteNeeded === undefined` (noch nicht beantwortet) -> Feld bleibt
    // leer, wie bei allen anderen optionalen Feldern. `false` -> "Nein"
    // (statt leer, damit "beantwortet, aber kein Angebot nötig" von
    // "noch nicht beantwortet" unterscheidbar bleibt). `true` -> der
    // Freitext, wofür das Angebot gebraucht wird.
    quoteNeededFor: report.quoteNeeded === undefined ? '' : report.quoteNeeded ? report.quoteNeededFor ?? '' : 'Nein',
    plantStatus: report.plantStatus ?? '',
    orderType: report.orderType ?? '',
    // Exakt die Vorlagen-eigenen Dropdown-Werte "i.O."/"n.i.O." statt einer
    // eigenen Ja/Nein-Beschriftung (siehe db/types.ts securityEquipmentOk).
    securityEquipmentOk: report.securityEquipmentOk === undefined ? '' : report.securityEquipmentOk ? 'i.O.' : 'n.i.O.',
    overnightStays: report.overnightStays ?? '',
    followUpVisitNeeded: report.followUpVisitNeeded === undefined ? '' : report.followUpVisitNeeded ? 'Ja' : 'Nein'
  };
  // Zeiten-Tabelle: eine Zeile pro Tag (`{#timeRows}`-Loop) + "Gesamt"-Zeile
  // (`{total...}`-Tags) - alle Werte fertig berechnet, siehe timesheetRows.ts.
  const timesheet = buildTimesheetRows(data.timeEntries, data.breaks ?? [], report.technicianName);
  templateData.timeRows = timesheet.rows;
  templateData.totalOutboundTravel = timesheet.totals.outboundTravel;
  templateData.totalOutboundKm = timesheet.totals.outboundKm;
  templateData.totalHours = timesheet.totals.hours;
  templateData.totalOvertime = timesheet.totals.overtime;
  templateData.totalReturnTravel = timesheet.totals.returnTravel;
  templateData.totalReturnKm = timesheet.totals.returnKm;
  for (let i = 0; i < MAX_PHOTOS; i++) {
    const photo = photos[i];
    // Nur die eigene Foto-Notiz - ohne eine solche bleibt die Spalte
    // bewusst leer (kein Zeitstempel-Fallback, ausdrücklicher Nutzerwunsch).
    templateData[`photo${i}Desc`] = photo ? photo.note ?? '' : '';
  }
  return templateData;
}

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

function extensionForMimeType(mimeType: string): string {
  return EXTENSION_BY_MIME_TYPE[mimeType] ?? 'jpeg';
}

/** Fügt bei Bedarf eine neue `Default Extension`-Deklaration hinzu - die Vorlage deckt bereits jpeg/png ab (dort bereits für andere eingebettete Bilder genutzt), nicht aber z.B. webp. */
function ensureContentType(contentTypesXml: string, extension: string, mimeType: string): string {
  if (new RegExp(`Extension="${extension}"`).test(contentTypesXml)) return contentTypesXml;
  return contentTypesXml.replace('</Types>', `<Default Extension="${extension}" ContentType="${mimeType}"/></Types>`);
}

/** Skaliert ein Foto proportional auf die Platzhalter-Bildbox (siehe PHOTO_BOX_MAX_PX) - ohne bekannte Originalgröße (sollte nicht vorkommen, defensiv) ein Quadrat als Fallback. */
function fitPhotoBox(width: number | undefined, height: number | undefined): { widthPx: number; heightPx: number } {
  if (!width || !height) return { widthPx: PHOTO_BOX_MAX_PX, heightPx: PHOTO_BOX_MAX_PX };
  if (width <= PHOTO_BOX_MAX_PX && height <= PHOTO_BOX_MAX_PX) return { widthPx: width, heightPx: height };
  const scale = PHOTO_BOX_MAX_PX / Math.max(width, height);
  return { widthPx: Math.round(width * scale), heightPx: Math.round(height * scale) };
}

/** Siehe Dateikommentar oben ("FOTOS - EIGENER WEG, KEIN BILD-MODUL") - mutiert `zip` direkt. */
async function injectPhotos(zip: PizZip, photos: Photo[]): Promise<void> {
  if (photos.length === 0) return;

  const documentFile = zip.file('word/document.xml');
  const relsFile = zip.file('word/_rels/document.xml.rels');
  const contentTypesFile = zip.file('[Content_Types].xml');
  if (!documentFile || !relsFile || !contentTypesFile) return; // sollte bei dieser Vorlage nie vorkommen, rein defensiv

  let documentXml = documentFile.asText();
  let relsXml = relsFile.asText();
  let contentTypesXml = contentTypesFile.asText();

  const embedPattern = new RegExp(`r:embed="${PLACEHOLDER_REL_ID}"`, 'g');
  const positions: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = embedPattern.exec(documentXml))) positions.push(match.index);

  const count = Math.min(photos.length, positions.length, MAX_PHOTOS);

  // In ABSTEIGENDER Zeilen-Reihenfolge ersetzen: jede Ersetzung ändert die
  // Textlänge, vorab ermittelte `positions` für noch nicht bearbeitete
  // (weiter vorne liegende) Zeilen bleiben so gültig.
  for (let i = count - 1; i >= 0; i--) {
    const photo = photos[i];
    const pos = positions[i];
    const extension = extensionForMimeType(photo.mimeType);
    const relId = `rIdPhoto${i}`;
    const mediaName = `photo${i}.${extension}`;
    const bytes = new Uint8Array(await photo.thumbnailBlob.arrayBuffer());

    zip.file(`word/media/${mediaName}`, bytes, { binary: true });
    relsXml = relsXml.replace(
      '</Relationships>',
      `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${mediaName}"/></Relationships>`
    );
    contentTypesXml = ensureContentType(contentTypesXml, extension, photo.mimeType);

    documentXml =
      documentXml.slice(0, pos) + documentXml.slice(pos).replace(`r:embed="${PLACEHOLDER_REL_ID}"`, `r:embed="${relId}"`);

    const drawingStart = documentXml.lastIndexOf('<w:drawing>', pos);
    const drawingEnd = documentXml.indexOf('</w:drawing>', pos) + '</w:drawing>'.length;
    const { widthPx, heightPx } = fitPhotoBox(photo.width, photo.height);
    const cx = widthPx * EMU_PER_PX;
    const cy = heightPx * EMU_PER_PX;
    let drawingBlock = documentXml.slice(drawingStart, drawingEnd);
    drawingBlock = drawingBlock.replace(/<wp:extent cx="\d+" cy="\d+"\/>/, `<wp:extent cx="${cx}" cy="${cy}"/>`);
    drawingBlock = drawingBlock.replace(/<a:ext cx="\d+" cy="\d+"\/>/, `<a:ext cx="${cx}" cy="${cy}"/>`);
    documentXml = documentXml.slice(0, drawingStart) + drawingBlock + documentXml.slice(drawingEnd);
  }

  zip.file('word/document.xml', documentXml);
  zip.file('word/_rels/document.xml.rels', relsXml);
  zip.file('[Content_Types].xml', contentTypesXml);
}

/**
 * Baut den Servicebericht als Word-Dokument aus der offiziellen ELSA-Vorlage.
 * Rein clientseitig, keine DB-/DOM-Zugriffe.
 *
 * `templateBytes` ist ausschließlich für Tests gedacht (Vitest läuft ohne
 * Dev-Server in einer Node-Umgebung, wo `fetch()` die von Vite verarbeitete,
 * relative Asset-URL nicht auflösen kann) - dort wird die Vorlagendatei
 * stattdessen direkt von der Festplatte gelesen und hier eingespeist, um
 * echte Render-Logik statt eines Mocks zu testen. Im normalen Betrieb
 * (Browser) bleibt der Parameter immer weg, dann greift der echte `fetch()`.
 */
export async function buildReportDocx(data: FullReport, templateBytes?: ArrayBuffer): Promise<Blob> {
  const templateBuffer: ArrayBuffer = templateBytes ?? (await fetch(templateUrl).then((res) => res.arrayBuffer()));
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  await doc.renderAsync(buildTemplateData(data));

  const outZip = doc.getZip();
  await injectPhotos(outZip, data.photos.slice(0, MAX_PHOTOS));

  return outZip.generate({ type: 'blob', mimeType: DOCX_MIME_TYPE });
}

/** Dateiname-Vorschlag für den Download, z.B. "Servicebericht-2026-0142.docx". */
export function suggestedFileName(report: ServiceReport): string {
  const safeProject = report.projectNumber.trim().replace(/[^\w.-]+/g, '_') || 'ohne-Projektnummer';
  return `Servicebericht-${safeProject}.docx`;
}
