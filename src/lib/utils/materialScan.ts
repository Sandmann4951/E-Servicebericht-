/**
 * Interpretiert den rohen Text eines gescannten Barcodes/QR-Codes von einem
 * Lieferanten-Etikett (z.B. Sonepar) für die Material-Schnellerfassung.
 *
 * Wichtige Einschränkung, bewusst so designt: Barcodes/QR-Codes auf
 * Lieferanten-Etiketten transportieren so gut wie nie einen Freitext wie die
 * Produktbeschreibung - das ist branchenüblich der GS1-Standard (siehe
 * unten), der nur IDs/Mengen/Daten codiert, keine Beschreibungstexte (die
 * stehen nur als für Menschen lesbarer Druck auf dem Etikett, nicht im
 * Code selbst). Diese Funktion füllt deshalb bewusst NUR Artikelnummer und
 * Menge automatisch, wenn sie zuverlässig erkannt werden - die Beschreibung
 * bleibt für den Monteur zum Abtippen vom Etikett, der Rohtext des Scans
 * wird dafür in der UI als Hinweis angezeigt (siehe MaterialSection.svelte).
 * Alle Felder bleiben in jedem Fall editierbar.
 */
export interface ParsedMaterialScan {
  articleNumber?: string;
  quantity?: number;
  /** Der unveränderte, dekodierte Scan-Text - immer gesetzt, auch wenn nichts erkannt wurde. */
  raw: string;
}

/**
 * GS1-Application-Identifier, die für unsere Zwecke relevant sind, mit
 * fester Länge (falls vorgeschrieben) - siehe GS1 General Specifications.
 * Variabel lange Felder (alle anderen hier gelisteten AIs) enden entweder am
 * FNC1/GS-Trennzeichen (Roh-Element-String) oder an der nächsten Klammer
 * (menschenlesbare "(AI)Wert"-Schreibweise).
 */
const GS1_FIXED_LENGTH: Record<string, number> = {
  '00': 18, // SSCC
  '01': 14, // GTIN
  '11': 6, // Produktionsdatum (YYMMDD)
  '17': 6 // Verfallsdatum (YYMMDD)
};

// Länge absteigend, damit z.B. "240" nicht fälschlich als "24" + "0..." gelesen wird.
const GS1_KNOWN_AIS = ['240', '241', '400', '401', '00', '01', '10', '11', '17', '21', '30', '37'];

const GS1_GROUP_SEPARATOR = '\u001D';

/** Erkennt und zerlegt eine menschenlesbare GS1-Schreibweise wie "(01)04012345123456(30)5". */
function parseGs1Bracketed(input: string): Record<string, string> | undefined {
  const matches = [...input.matchAll(/\((\d{2,4})\)([^(]*)/g)];
  if (matches.length === 0) return undefined;
  const result: Record<string, string> = {};
  for (const match of matches) {
    result[match[1]] = match[2].trim();
  }
  return result;
}

/**
 * Zerlegt einen rohen GS1-Element-String (wie er von einem Scanner nach dem
 * Dekodieren eines GS1-128/DataMatrix/QR-Codes geliefert wird), bei dem
 * variabel lange Felder durch ein FNC1/GS-Steuerzeichen (0x1D) voneinander
 * getrennt sind. Bricht beim ersten nicht erkannten AI ab und gibt die bis
 * dahin erkannten Felder zurück - besser ein Teilergebnis als gar keins.
 */
function parseGs1ElementString(input: string): Record<string, string> | undefined {
  let s = input.startsWith(GS1_GROUP_SEPARATOR) ? input.slice(1) : input;
  if (!/^\d/.test(s)) return undefined; // GS1-Element-Strings beginnen immer mit einem numerischen AI

  const result: Record<string, string> = {};
  let i = 0;
  while (i < s.length) {
    const ai = GS1_KNOWN_AIS.find((candidate) => s.startsWith(candidate, i));
    if (!ai) break;
    i += ai.length;

    const fixedLength = GS1_FIXED_LENGTH[ai];
    if (fixedLength) {
      result[ai] = s.slice(i, i + fixedLength);
      i += fixedLength;
    } else {
      const gsIndex = s.indexOf(GS1_GROUP_SEPARATOR, i);
      const end = gsIndex === -1 ? s.length : gsIndex;
      result[ai] = s.slice(i, end);
      i = gsIndex === -1 ? s.length : gsIndex + 1;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Liefert eine plausible Menge (positive, endliche Zahl) oder undefined. */
function toPositiveNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : undefined;
}

export function parseScannedMaterialLabel(raw: string): ParsedMaterialScan {
  const trimmed = raw.trim();

  const gs1 = parseGs1Bracketed(trimmed) ?? parseGs1ElementString(trimmed);
  if (gs1) {
    // 240/241 (herstellerspezifische Zusatz-ID / Kunden-Teilenummer) sind bei
    // Großhändler-Etiketten häufig die eigentliche Artikelnummer des
    // Lieferanten - bevorzugt vor der reinen GTIN (01), falls beide da sind.
    const articleNumber = gs1['240'] ?? gs1['241'] ?? gs1['01'];
    // 30 (Stückzahl) bzw. 37 (Anzahl Handelseinheiten) - je nachdem, was der Code trägt.
    const quantity = toPositiveNumber(gs1['30'] ?? gs1['37']);
    return { articleNumber, quantity, raw: trimmed };
  }

  // Kein GS1-Format erkannt (z.B. ein proprietärer Code oder reiner Text) -
  // best-effort per Muster-Suche im Rohtext statt strukturierter Zerlegung.
  const quantityMatch = trimmed.match(/(\d+)\s*(?:st(?:k|ück)?|pcs?|ea)\b/i);
  const quantity = quantityMatch ? toPositiveNumber(quantityMatch[1]) : undefined;

  // Erster hinreichend lange Ziffernfolge als Artikelnummer-Kandidat - typische
  // Artikel-/Bestellnummern-Länge bei Großhändlern (Sonepar u.ä.).
  const articleNumberMatch = trimmed.match(/\b\d{6,10}\b/);
  const articleNumber = articleNumberMatch?.[0];

  return { articleNumber, quantity, raw: trimmed };
}
