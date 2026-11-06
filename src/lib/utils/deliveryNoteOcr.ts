/**
 * Interpretiert den per Texterkennung (OCR, siehe BarcodeScanner.svelte
 * "Lieferschein"-Modus) aus einem fotografierten Lieferschein gelesenen Text
 * für die Material-Schnellerfassung. Anders als beim Einzel-Etikett-Scan
 * (siehe labelOcr.ts parseLabelText(), das bei mehreren Treffern bewusst nur
 * den EINEN besten zurückgibt) enthält ein Lieferschein in der Regel MEHRERE
 * Artikelpositionen - diese Funktion liefert deshalb ALLE gefundenen
 * Positionen als Liste, statt nur eine auszuwählen.
 *
 * Zwei Erkennungsschritte, in dieser Reihenfolge:
 * 1. `parseSoneparDeliveryNote()` - spezialisiert auf das wiederkehrende
 *    Sonepar-Lieferschein-Format (siehe dort), das der Nutzer anhand eines
 *    echten Beispielfotos als Vorlage vorgegeben hat.
 * 2. Nur falls das nichts findet: die bisherige, lieferantenunabhängige
 *    generische Heuristik (`parseGenericDeliveryNote()`, "<Ziffernfolge>
 *    <Beschreibung>" in einer Zeile oder auf zwei Zeilen verteilt) als
 *    Fallback für andere/unbekannte Lieferscheinformate.
 *
 * Menge pro Position wird nur übernommen, wenn sie sich eindeutig zuordnen
 * lässt - sonst bleibt sie bewusst leer, damit der Nutzer sie in der
 * Review-Liste selbst eintragen kann, statt eine falsche Menge zu erfinden.
 * Reine Heuristik auf Basis von Zeilenmustern - liefert deshalb bewusst nur
 * Vorschläge, die vor der Übernahme in der UI geprüft/korrigiert werden
 * können.
 */
export interface ParsedDeliveryNoteItem {
  articleNumber?: string;
  description: string;
  quantity?: number;
}

/** Zeilen mit diesem Begriff sind IMMER die "alte Artikel-Nr. + laufende Bestellposition"-Zeile (reines Rauschen) - NIE eine eigene Position, egal welches Muster sonst noch zutrifft (deckt auch OCR-Tippfehler wie "Kundenbestellpositon"/"Kundenbestellposiion" ab, da nur das robuste Präfix geprüft wird). */
const NOISE_LINE = /kundenbestellpos/i;

const UNIT_PATTERN = /(?:st(?:k|ück)?|pcs?|ea)\.?/i;
const STANDALONE_QUANTITY = new RegExp(`^(\\d{1,4})\\s*${UNIT_PATTERN.source}$`, 'i');
const TRAILING_QUANTITY = new RegExp(`\\s+(\\d{1,4})\\s*${UNIT_PATTERN.source}$`, 'i');

function toPositiveNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : undefined;
}

function standaloneQuantity(line: string | undefined): number | undefined {
  if (!line) return undefined;
  const match = line.match(STANDALONE_QUANTITY);
  return match ? toPositiveNumber(match[1]) : undefined;
}

function parseGenericDeliveryNote(rawOcrText: string): ParsedDeliveryNoteItem[] {
  const lines = rawOcrText
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const items: ParsedDeliveryNoteItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    // Siehe NOISE_LINE - verhindert, dass z.B. bei einem Sonepar-Lieferschein
    // (falls der spezialisierte Schritt ausnahmsweise nichts findet) die
    // "alte Artikel-Nr. Kundenbestellposition: N"-Zeile hier fälschlich als
    // eigene Position mit Artikelnummer + Beschreibung "Kundenbestellposition: N" erkannt wird.
    if (NOISE_LINE.test(lines[i])) continue;

    const sameLine = lines[i].match(/^(\d{5,10})\s+([A-Za-zÄÖÜäöüß].{2,})$/);
    if (sameLine) {
      const articleNumber = sameLine[1];
      let description = sameLine[2].trim();
      let quantity: number | undefined;

      const trailing = description.match(TRAILING_QUANTITY);
      if (trailing) {
        quantity = toPositiveNumber(trailing[1]);
        description = description.slice(0, trailing.index).trim();
      } else {
        quantity = standaloneQuantity(lines[i + 1]);
      }

      if (description) items.push({ articleNumber, description, quantity });
      continue;
    }

    const bareNumber = lines[i].match(/^(\d{5,10})$/);
    const nextLine = lines[i + 1];
    if (!bareNumber || !nextLine) continue;
    if (NOISE_LINE.test(nextLine)) continue;
    // Eine Zeile, die selbst nur aus "<Zahl> <Einheit>" besteht, ist die
    // Menge einer VORHERIGEN Position, keine Beschreibung - sonst würde z.B.
    // "5912361\n3 Stk" fälschlich als Artikel "5912361" mit Beschreibung
    // "3 Stk" erkannt.
    if (STANDALONE_QUANTITY.test(nextLine)) continue;
    if (!/[A-Za-zÄÖÜäöüß]{3,}/.test(nextLine)) continue;

    items.push({ articleNumber: bareNumber[1], description: nextLine, quantity: standaloneQuantity(lines[i + 2]) });
  }

  return items;
}

/** Entfernt OCR-Trennrauschen (Unterstriche/Pipes aus fehlinterpretierten Tabellenlinien, doppelte Leerzeichen), ohne echte Inhalte zu verändern. */
function cleanSoneparLine(line: string): string {
  return line
    .replace(/[_|]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const SONEPAR_ARTICLE_NUMBER = /\d{6,10}/;
/** "<Zahl>,<Zahl><Einheit>" - z.B. "1,00 ST", "2,00KA1" (OCR lässt das Leerzeichen vor der Einheit gelegentlich weg). Einheit optional, falls sie auf eine Folgezeile verrutscht ist. */
const SONEPAR_QUANTITY = /(\d{1,4}),(\d{2})\s*([A-Za-zÄ]{1,4}\d{0,3})?/g;

/**
 * Spezialisiert auf das wiederkehrende Sonepar-Lieferschein-Format (anhand
 * eines echten Beispielfotos vom Nutzer vorgegeben): jede Position belegt
 * zwei Zeilen -
 *   "<neue Artikel-Nr.> <Bezeichnung> <Bestellmenge> <Einheit> <Liefermenge> <Einheit>"
 *   "<alte Artikel-Nr.> Kundenbestellposition: <lfd. Nr.>"
 * Die zweite Zeile ist reines Rauschen (siehe NOISE_LINE) und wird nie als
 * eigene Position gewertet. Übernommen wird immer die NEUE/obere
 * Artikelnummer (nicht die alte) sowie die LIEFERMENGE (die letzte/rechte
 * Mengenangabe der Zeile, nicht die Bestellmenge) - das ist laut Nutzer die
 * tatsächlich angekommene, zu verbauende Menge.
 *
 * Eine Zeile wird nur dann als Position gewertet, wenn sie MINDESTENS eine
 * Mengenangabe im SONEPAR_QUANTITY-Format enthält - das schließt zuverlässig
 * die Kopf-/Metadatenzeilen vor der eigentlichen Tabelle aus (Kundennummer,
 * SCID/SAP, Bestelldaten, Kommission usw.), die zwar teils auch
 * 6-10-stellige Ziffernfolgen enthalten, aber nie eine solche Mengenangabe
 * auf derselben Zeile.
 *
 * Bei starker Bildunschärfe/-schräglage kann die Mengenangabe einzelner
 * Positionen auf eine nicht mehr zuordenbare Nachbarzeile verrutschen - eine
 * solche Position wird dann (bewusst, siehe Klassenkommentar oben) NICHT
 * erkannt, statt eine falsche Menge zu raten oder eine Position ohne jede
 * erkennbare Mengenangabe ungeprüft durchzulassen.
 */
function parseSoneparDeliveryNote(rawOcrText: string): ParsedDeliveryNoteItem[] {
  const lines = rawOcrText
    .split(/\r?\n/)
    .map(cleanSoneparLine)
    .filter(Boolean);

  const items: ParsedDeliveryNoteItem[] = [];

  for (const line of lines) {
    if (NOISE_LINE.test(line)) continue;

    const articleMatch = line.match(SONEPAR_ARTICLE_NUMBER);
    if (!articleMatch || articleMatch.index === undefined) continue;
    const articleEnd = articleMatch.index + articleMatch[0].length;

    const quantityMatches = [...line.matchAll(SONEPAR_QUANTITY)];
    if (quantityMatches.length === 0) continue;

    const firstQuantity = quantityMatches[0];
    const lastQuantity = quantityMatches[quantityMatches.length - 1];
    if (firstQuantity.index === undefined) continue;

    const description = line
      .slice(articleEnd, firstQuantity.index)
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (description.length < 3) continue;

    const quantity = toPositiveNumber(`${lastQuantity[1]}.${lastQuantity[2]}`);
    items.push({ articleNumber: articleMatch[0], description, quantity });
  }

  return items;
}

export function parseDeliveryNoteText(rawOcrText: string): ParsedDeliveryNoteItem[] {
  const soneparItems = parseSoneparDeliveryNote(rawOcrText);
  if (soneparItems.length > 0) return soneparItems;
  return parseGenericDeliveryNote(rawOcrText);
}
