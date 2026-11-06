/**
 * Interpretiert den per Texterkennung (OCR, siehe BarcodeScanner.svelte
 * "Lieferschein"-Modus) aus einem fotografierten Lieferschein gelesenen Text
 * für die Material-Schnellerfassung. Anders als beim Einzel-Etikett-Scan
 * (siehe labelOcr.ts parseLabelText(), das bei mehreren Treffern bewusst nur
 * den EINEN besten zurückgibt) enthält ein Lieferschein in der Regel MEHRERE
 * Artikelpositionen - diese Funktion liefert deshalb ALLE gefundenen
 * Positionen als Liste, statt nur eine auszuwählen.
 *
 * Gleiche Grundheuristik wie labelOcr.ts ("<Ziffernfolge> <Beschreibung>" in
 * einer Zeile oder auf zwei Zeilen verteilt), hier aber ohne den "nur der
 * beste Treffer gewinnt"-Schritt. Menge pro Position wird nur übernommen,
 * wenn sie sich eindeutig zuordnen lässt (direkt in der Beschreibung
 * angehängt oder als alleinstehende Zeile direkt danach) - sonst bleibt sie
 * bewusst leer, damit der Nutzer sie in der Review-Liste selbst eintragen
 * kann, statt eine falsche Menge zu erfinden.
 *
 * Reine Heuristik auf Basis von Zeilenmustern, kein festes Format (jeder
 * Lieferant druckt anders) - liefert deshalb bewusst nur Vorschläge, die vor
 * der Übernahme in der UI geprüft/korrigiert werden können.
 */
export interface ParsedDeliveryNoteItem {
  articleNumber?: string;
  description: string;
  quantity?: number;
}

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

export function parseDeliveryNoteText(rawOcrText: string): ParsedDeliveryNoteItem[] {
  const lines = rawOcrText
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const items: ParsedDeliveryNoteItem[] = [];

  for (let i = 0; i < lines.length; i++) {
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
