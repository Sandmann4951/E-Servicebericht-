/**
 * Interpretiert den per PDF-Text-Extraktion (siehe
 * src/lib/import/serviceOrderPdf.ts) aus einem ELSA-eigenen
 * "Serviceauftrag"-PDF gelesenen Text - Servicetechniker bekommen diesen
 * Auftrag aktuell per E-Mail/Teams zugeschickt und tippen Projektnummer,
 * Kundendaten und erwartetes Material bisher von Hand ab. Dieser Parser
 * liest stattdessen die wichtigsten Felder automatisch heraus, damit sich
 * daraus in einem Schritt ein neuer Bericht samt vorausgefüllter
 * Materialliste (erwartete Menge je Position) anlegen lässt.
 *
 * Reine Heuristik auf GENAU dieses eine, feste Vorlagen-Format zugeschnitten
 * (ELSA's eigenes ERP-System, erkennbar an "Serviceauftrag"/
 * "Pos. Menge Ein. Text"/"-KUNDENDATEN -" etc.) - kein allgemeingültiger
 * Standard wie bei GS1-Codes (siehe materialScan.ts). Liefert deshalb
 * bewusst nur einen Vorschlag: alle erkannten Felder bleiben vor dem
 * Speichern frei editierbar, nichts wird automatisch final übernommen.
 *
 * Wichtige Eigenart der PDF-Text-Extraktion (pdfjs-dist): Text auf
 * derselben visuellen Zeile wird OHNE jedes Trennzeichen aneinander-
 * gereiht (aus der Tabellenzeile "1.010   4   m   Leitungsführungskanal
 * LF 15x15 vw" wird der String "1.0104mLeitungsführungskanal LF 15x15
 * vw") - Menge und Einheit lassen sich deshalb nicht über Leerzeichen
 * trennen, sondern nur über eine Liste bekannter Einheiten-Schreibweisen
 * (KNOWN_UNITS) erkennen.
 *
 * OCR-FALLBACK: Bei einer bildlastigeren Export-Variante des Service-
 * auftrags (ein Großteil des dynamischen Inhalts liegt dort als
 * rasterisiertes Bild statt echtem Text vor) liefert extractPdfText()
 * verdächtig wenig Inhalt - importServiceOrder.ts versucht dann
 * automatisch stattdessen extractPdfTextViaOcr() (Texterkennung,
 * serviceOrderPdf.ts), siehe shouldAttemptOcrFallback() unten für die
 * genaue Schwellwert-Logik. OCR-Text hat ECHTE Leerzeichen zwischen
 * Wörtern/Spalten (anders als die obige leerzeichenlose Verschmelzung) -
 * ITEM_LINE/SECTION_HEADER_LINE tolerieren deshalb beide Formen über
 * optionale "\s*" zwischen den Teilen, statt zwei getrennte Parser zu
 * pflegen.
 */
export interface ParsedServiceOrderMaterial {
  description: string;
  quantity: number;
  unit: string;
  /**
   * Herstelller-/Lieferanten-Artikelnummer aus der "Art.-Nr."-Spalte einer
   * neueren Vorlagen-Variante (z.B. echtes Beispiel Dok-Nr. 266070) - dort
   * steht sie ohne jedes Trennzeichen direkt hinter der Beschreibung auf
   * derselben Zeile (siehe ARTICLE_NUMBER_SUFFIX unten). Die ältere
   * Vorlagen-Variante ohne diese Spalte liefert hier einfach undefined.
   */
  articleNumber?: string;
}

export interface ParsedServiceOrder {
  projectNumber?: string;
  /** Die Nummer des Serviceauftrags-Dokuments selbst (nicht die Projektnummer) - z.B. für Rückfragen beim Büro. */
  documentNumber?: string;
  customer?: string;
  contactPerson?: string;
  contactPhone?: string;
  /** Kurzbeschreibung des Auftrags, z.B. "Kabelkanal Markiese, Steckdose Terrasse". */
  projectDescription?: string;
  materials: ParsedServiceOrderMaterial[];
  /** Arbeitsaufwand-/Pauschal-Positionen (z.B. "8 Std. Leitender Monteur") - kein Material, nur zur Information. */
  laborLines: string[];
  /**
   * Summe aller Arbeitsaufwand-Positionen mit Einheit "Std" (Pauschalen/
   * Stückzahlen wie "An- und Abreisepauschale" zählen nicht als Zeit) -
   * Basis für den Mannstunden-Soll/Ist-Vergleich in der Übersicht (siehe
   * ServiceReport.plannedLaborHours). undefined, wenn keine
   * Stunden-Position gefunden wurde.
   */
  plannedLaborHours?: number;
  /** Der unveränderte, aus dem PDF extrahierte Text - immer gesetzt, auch wenn nichts erkannt wurde. */
  raw: string;
}

// Bekannte Mengeneinheiten aus dem Serviceauftrag - längere/spezifischere
// Schreibweisen zuerst in der Alternative, damit z.B. "Std." nicht schon
// durch "Std" ohne den Punkt "abgeschnitten" wird (der Punkt würde sonst in
// der Beschreibung hängen bleiben).
const KNOWN_UNITS = ['Stück', 'Pauschale', 'Pau', 'Std\\.', 'Stck', 'Std', 'lfm', 'Set', 'Pkg', 'kg', 'm'];
const UNIT_PATTERN = KNOWN_UNITS.join('|');

// z.B. "1.0104mLeitungsführungskanal LF 15x15 vw" -> Pos. "1.010", Menge "4", Einheit "m", Text "...".
// Die Unterposition bewusst auf GENAU 3 Ziffern festgelegt (010, 020, 030, ...,
// durchgängig im Vorlagen-Format so verwendet) statt greedy "\d+": sonst wäre
// z.B. bei "3.01020mNYY-J 3x2,5" (Pos. 3.010, Menge 20, Einheit m) nicht
// erkennbar, wo die Unterposition endet und die Menge beginnt - beide sind
// nur Ziffern, ohne jedes Trennzeichen direkt aneinandergereiht.
//
// Die "\s*" zwischen den Teilen sind bewusst OPTIONAL (nicht verpflichtend):
// pdfjs' Text-Extraktion (extractPdfText(), serviceOrderPdf.ts) verschmilzt
// Text derselben Zeile komplett ohne Trennzeichen (s.o.), während ein
// Texterkennung-Fallback (extractPdfTextViaOcr()) echte, im Dokument
// gedruckte Leerzeichen zwischen den Spalten liefert - ein gemeinsamer
// Parser statt zwei getrennter Implementierungen, der beide Formen versteht.
const ITEM_LINE = new RegExp(`^\\d+\\.\\d{3}\\s*(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_PATTERN})\\s*(.+)$`);
// z.B. "1Kabelkanal Markiese 1.OG" (pdfjs) oder "1 Kabelkanal Markiese 1.OG" (OCR) -> Abschnitt "1", Titel "Kabelkanal Markiese 1.OG".
const SECTION_HEADER_LINE = /^(\d+)\s*([A-Za-zÄÖÜäöüß].*)$/;

// Trennt die am Ende einer Material-Beschreibung ohne jedes Leerzeichen
// angehängte Artikelnummer ab (z.B. "Hager Phasenschiene0606736" -> Text
// "Hager Phasenschiene", Artikelnummer "0606736") - gilt NUR für die neuere
// Vorlagen-Variante mit eigener "Art.-Nr."-Spalte (dort immer GENAU 7
// Ziffern, durchgängig in allen Beispielen so beobachtet). Bewusst exakt 7
// Ziffern statt "eine beliebige Ziffernfolge am Ende": verhindert, dass bei
// der älteren Vorlagen-Variante (ohne Art.-Nr.-Spalte) eine zufällig am Ende
// stehende kurze Zahl aus dem eigentlichen Produktnamen herausgeschnitten
// wird. Die nicht-gierige Gruppe davor lässt die Regex-Engine automatisch
// exakt die letzten 7 Ziffern als Artikelnummer isolieren, unabhängig davon,
// was davor steht.
const ARTICLE_NUMBER_SUFFIX = /^(.*?)(\d{7})$/;

const TABLE_HEADER_LINE = /^Pos\.?\s*Menge\s*Ein\.?\s*Text/i;
const PAGE_FOOTER_LINE = /^Seite\s+\d+\s+von\s+\d+$/i;
// Wiederkehrende Brief-/Fußzeilen (Bankverbindung, Handelsregister, Kontakt) -
// werden sonst versehentlich als Fortsetzungszeile der letzten Position
// angehängt, da sie keinem der übrigen Muster entsprechen.
const BOILERPLATE_LINE = [
  /Kreissparkasse/i,
  /SWIFT-BIC/i,
  /^IBAN:/i,
  /HRB\s+\d/,
  /UID-Nr\./,
  /elsa-service\.de/i,
  /^Tel\.:/i,
  /^ELSA\b/i
];

function isBoilerplate(line: string): boolean {
  return BOILERPLATE_LINE.some((pattern) => pattern.test(line));
}

function toPositiveNumber(value: string): number | undefined {
  const num = Number(value.replace(',', '.'));
  return Number.isFinite(num) && num > 0 ? num : undefined;
}

/** Normalisiert "Stck"/"Stück" auf die im Material-Tab übliche Schreibweise "Stk", "Std."/"Std" auf "Std". */
function normalizeUnit(unit: string): string {
  const lower = unit.toLowerCase();
  if (lower === 'stck' || lower === 'stück') return 'Stk';
  if (lower === 'std.' || lower === 'std') return 'Std';
  return unit;
}

function findValue(lines: string[], pattern: RegExp): string | undefined {
  for (const line of lines) {
    const match = pattern.exec(line);
    if (match) return match[1].trim();
  }
  return undefined;
}

/**
 * Sucht den Kundennamen über den Marker "-KUNDENDATEN -" (einziger Block im
 * Dokument, der garantiert NICHT mit der Info-Box oben rechts auf derselben
 * Zeile verschmilzt - siehe PDF-Extraktions-Eigenart oben) - die ersten paar
 * Zeilen danach sind Anrede (Frau/Herr/Firma, optional), Name, Straße, PLZ/Ort.
 */
function findCustomer(lines: string[]): string | undefined {
  const index = lines.findIndex((line) => /^-?\s*KUNDENDATEN\s*-?$/i.test(line));
  if (index === -1) return undefined;
  const candidates = lines.slice(index + 1, index + 4);
  const nameLine = candidates.find((line) => !/^(Frau|Herr|Firma|Familie)$/i.test(line));
  return nameLine;
}

/**
 * Fallback für die Kurzbeschreibung, wenn die bevorzugte Form "Auftrag: ..."
 * (Text auf derselben Zeile) nichts liefert - bei einer neueren Vorlagen-
 * Variante (z.B. echtes Beispiel Dok-Nr. 266070) bleibt die "Auftrag:"-Zeile
 * leer und der eigentliche Text steht stattdessen auf der Zeile DIREKT NACH
 * der leeren "Bemerkungen:"-Zeile. Die nachfolgende Zeile wird nur
 * übernommen, wenn sie nicht bereits eines der nächsten bekannten
 * Kopf-Labels ist (sonst wäre bei tatsächlich leeren Bemerkungen das
 * nächste Label selbst fälschlich die "Beschreibung").
 */
function findBemerkungenFallback(lines: string[]): string | undefined {
  const index = lines.findIndex((line) => /^Bemerkungen:\s*$/i.test(line));
  if (index === -1) return undefined;
  const next = lines[index + 1];
  if (!next || /^(Projektnummer:|Sachbearbeiter:|Projektleiter:|-?\s*KUNDENDATEN)/i.test(next)) return undefined;
  return next;
}

export function parseServiceOrderText(rawText: string): ParsedServiceOrder {
  const raw = rawText.trim();
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  // Bevorzugt die volle Schreibweise "Projektnummer:" (in der Praxis seltener
  // von Formatierungs-/Verschmelzungs-Problemen betroffen als die Info-Box
  // oben rechts) - als Fallback zusätzlich die abgekürzte Form "Projektnr.:"
  // aus der Kopf-Info-Box. Relevant z.B. bei einer bildlastigeren Export-
  // Variante des Serviceauftrags, bei der ein Großteil des dynamischen
  // Inhalts (inkl. der vollen "Projektnummer:"-Zeile) als rasterisiertes
  // Bild statt echtem Text vorliegt - dort bleibt nur die Info-Box
  // ("Projektnr.: 266139") als echter, auslesbarer Text übrig.
  const projectNumber = findValue(lines, /Projektnummer:\s*(\S+)/) ?? findValue(lines, /Projektnr\.?:?\s*(\S+)/);
  const documentNumber = findValue(lines, /Dok-nr\.\s*:\s*(\S+)/);
  const projectDescription = findValue(lines, /Auftrag:\s*(.+)/) ?? findBemerkungenFallback(lines);
  const contactPerson = findValue(lines, /Ansprechpartner vor Ort:\s*(.+)/);
  const contactPhone = findValue(lines, /Telefon:\s*(.+)/);
  const customer = findCustomer(lines);

  const materials: ParsedServiceOrderMaterial[] = [];
  const laborLines: string[] = [];
  let plannedLaborHoursSum = 0;

  // Erst ab der Tabellen-Kopfzeile ("Pos. Menge Ein. Text") wird überhaupt
  // nach Positionen gesucht - alles davor (Kopf-/Kundendaten) ist bereits
  // oben per findValue()/findCustomer() behandelt und soll hier nicht
  // versehentlich als Fortsetzungszeile einer Position misverstanden werden.
  let inTable = false;
  let section: 'material' | 'labor' = 'material';
  // Zeiger auf die zuletzt erkannte Position - Folgezeilen ohne eigenes
  // Positions-/Abschnitts-Muster (z.B. "Obermonteur für Energie- und
  // Gebäudetechnik") werden daran als Fortsetzung der Beschreibung angehängt.
  let currentMaterial: ParsedServiceOrderMaterial | undefined;
  let currentLaborIndex: number | undefined;
  // Abschnitte sind im Vorlagen-Format immer fortlaufend ab 1 nummeriert
  // (1, 2, 3, ...) - echte Beispiele bestätigen das sowohl in der älteren
  // ("1Kabelkanal...", "2Markiese...", ..., "5Arbeitsaufwand") als auch der
  // neueren Variante ("1Material", "2Lohn"). Ohne diese Prüfung würde eine
  // Fortsetzungszeile, die zufällig mit "<Ziffer><Buchstabe>" beginnt (z.B.
  // "4p,16qmm,12mod,Gabel KDN451D" als zweite Zeile einer Materialposition),
  // fälschlich als neuer Abschnitt erkannt - inkl. Reset von currentMaterial,
  // wodurch der Rest der Beschreibung stillschweigend verloren ginge.
  let nextSectionNumber = 1;

  for (const line of lines) {
    if (TABLE_HEADER_LINE.test(line)) {
      // NUR den Tabellen-Modus aktivieren - bewusst NICHT currentMaterial/
      // currentLaborIndex zurücksetzen: dieselbe Kopfzeile taucht auf JEDER
      // Seite erneut auf (siehe SAMPLE_RAW unten, "Seite X von Y" gefolgt
      // von einer erneuten "Pos. Menge Ein. Text"-Zeile), eine Beschreibung
      // kann aber über einen Seitenumbruch hinweg weitergehen (z.B.
      // "...je" auf Seite 2, Fortsetzung "Wallbox" auf Seite 3) - ein Reset
      // hier würde diese Fortsetzungszeile sonst stillschweigend verwerfen.
      inTable = true;
      continue;
    }
    if (!inTable || PAGE_FOOTER_LINE.test(line) || isBoilerplate(line)) continue;

    const itemMatch = ITEM_LINE.exec(line);
    if (itemMatch) {
      const [, quantityText, unitText, description] = itemMatch;
      const quantity = toPositiveNumber(quantityText);
      const text = description.trim();
      if (quantity === undefined || !text) continue;
      const unit = normalizeUnit(unitText);
      if (section === 'labor') {
        laborLines.push(`${quantityText} ${unit} ${text}`.trim());
        currentLaborIndex = laborLines.length - 1;
        currentMaterial = undefined;
        if (unit === 'Std') plannedLaborHoursSum += quantity;
      } else {
        const artMatch = ARTICLE_NUMBER_SUFFIX.exec(text);
        const hasArticleNumber = artMatch && artMatch[1].trim();
        currentMaterial = hasArticleNumber
          ? { description: artMatch[1].trim(), quantity, unit, articleNumber: artMatch[2] }
          : { description: text, quantity, unit };
        materials.push(currentMaterial);
        currentLaborIndex = undefined;
      }
      continue;
    }

    const sectionMatch = SECTION_HEADER_LINE.exec(line);
    if (sectionMatch && Number(sectionMatch[1]) === nextSectionNumber) {
      const title = sectionMatch[2].trim();
      // "Arbeitsaufwand" (ältere Vorlagen-Variante) und "Lohn" (neuere
      // Variante, z.B. reale Bestellung Dok-Nr. 266070) markieren beide
      // denselben Abschnitt - keine Material-, sondern Zeit-/Pauschal-
      // Positionen.
      section = /arbeitsaufwand|lohn/i.test(title) ? 'labor' : 'material';
      currentMaterial = undefined;
      currentLaborIndex = undefined;
      nextSectionNumber++;
      continue;
    }

    // Fortsetzungszeile der zuletzt erkannten Position (z.B. eine zweite
    // Beschreibungszeile) - andernfalls bleibt die Zeile ohne Effekt.
    if (currentMaterial) {
      currentMaterial.description = `${currentMaterial.description} ${line}`.trim();
    } else if (currentLaborIndex !== undefined) {
      laborLines[currentLaborIndex] = `${laborLines[currentLaborIndex]} ${line}`.trim();
    }
  }

  return {
    projectNumber,
    documentNumber,
    customer,
    contactPerson,
    contactPhone,
    projectDescription,
    materials,
    laborLines,
    plannedLaborHours: plannedLaborHoursSum > 0 ? plannedLaborHoursSum : undefined,
    raw
  };
}

/**
 * Minimale Zeichenzahl, ab der eine normale Text-Extraktion (extractPdfText(),
 * serviceOrderPdf.ts) als "ausreichend" gilt - rein empirisch an der echten,
 * normal auslesbaren Hanslbauer-Beispieldatei (mehrere Tausend Zeichen)
 * gegenüber der bildlastigeren Klenzestraße-Variante (nur die statische
 * Kopf-Info-Box bleibt echter Text, keine 300 Zeichen) kalibriert - bewusst
 * deutlich näher an letzterer als an ersterer, um auch ein PDF mit nur EINER
 * Materialposition (kurzer, aber vollständig lesbarer Text) nicht
 * fälschlich als "zu wenig" einzustufen.
 */
const MIN_TEXT_LENGTH_BEFORE_OCR_FALLBACK = 500;

/**
 * Entscheidet, ob sich ein OCR-Fallback (extractPdfTextViaOcr(),
 * serviceOrderPdf.ts) lohnen könnte: die normale Text-Extraktion lieferte
 * verdächtig wenig UND daraus ließ sich weder ein Kunde noch irgendein
 * Material erkennen - typisch für eine bildlastigere Export-Variante des
 * Serviceauftrags, bei der ein Großteil des dynamischen Inhalts als
 * rasterisiertes Bild statt echtem Text vorliegt. Ein PDF mit tatsächlich
 * wenig Inhalt, aber vollständig lesbarem Text (z.B. nur eine einzelne
 * Material-Position), löst den Fallback NICHT fälschlich aus, da dort
 * bereits Kunde und/oder Material erkannt werden.
 */
export function shouldAttemptOcrFallback(rawText: string, parsed: ParsedServiceOrder): boolean {
  if (rawText.trim().length >= MIN_TEXT_LENGTH_BEFORE_OCR_FALLBACK) return false;
  return !parsed.customer && parsed.materials.length === 0;
}
