/**
 * Interpretiert den per Texterkennung (OCR, siehe BarcodeScanner.svelte
 * "Etikett-Text"-Modus) aus einem fotografierten Lieferanten-Etikett
 * gelesenen Text für die Material-Schnellerfassung. Anders als bei einem
 * gescannten QR-/Barcode (siehe materialScan.ts, das dort bewusst NIE die
 * Beschreibung befüllt, da Codes i.d.R. keinen Freitext tragen) steht auf
 * vielen Lieferanten-Etiketten Artikelnummer, Beschreibung UND Stückzahl
 * bereits als für Menschen lesbarer Text gedruckt - diese Funktion versucht
 * deshalb, alle drei direkt aus dem erkannten Text herauszulesen.
 *
 * Reine Heuristik auf Basis von Zeilenmustern, kein festes Format (jeder
 * Lieferant druckt anders) - liefert deshalb bewusst nur einen Vorschlag.
 * OCR-Ergebnisse sind naturgemäß fehleranfälliger als ein exakt dekodierter
 * Code (Beleuchtung, Verzerrung, Schriftgröße) - alle erkannten Felder
 * bleiben in der UI vor dem Speichern frei editierbar, der komplette
 * erkannte Rohtext wird zusätzlich angezeigt, damit sich das Ergebnis
 * schnell mit dem Etikett abgleichen lässt.
 */
export interface ParsedLabelText {
  articleNumber?: string;
  description?: string;
  quantity?: number;
  /** Der unveränderte, per OCR erkannte Text - immer gesetzt, auch wenn nichts erkannt wurde. */
  raw: string;
}

function toPositiveNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : undefined;
}

/**
 * Sucht die Stückzahl. Bevorzugt eine Zeile, die NUR aus "<Zahl> <Einheit>"
 * besteht (z.B. "1 ST" oder "12 Stk") - auf Lieferanten-Etiketten steht die
 * Menge meist so prominent/alleinstehend gedruckt. Nur wenn keine solche
 * Zeile existiert, wird das Muster irgendwo im Fließtext gesucht (unschärfer,
 * z.B. verwechselbar mit einer zufällig passenden Ziffernfolge).
 */
function findQuantity(lines: string[], rawText: string): number | undefined {
  const unitPattern = /(?:st(?:k|ück)?|pcs?|ea)\.?/i;
  const standaloneLine = lines.find((line) => new RegExp(`^(\\d{1,4})\\s*${unitPattern.source}$`, 'i').test(line));
  if (standaloneLine) {
    return toPositiveNumber(standaloneLine.match(/^(\d{1,4})/)?.[1]);
  }
  const match = rawText.match(new RegExp(`\\b(\\d{1,4})\\s*${unitPattern.source}\\b`, 'i'));
  return match ? toPositiveNumber(match[1]) : undefined;
}

/**
 * Sucht Artikelnummer + Beschreibung anhand des auf Großhändler-Etiketten
 * verbreiteten Musters "<Ziffernfolge> <Produktbezeichnung>" - entweder in
 * einer Zeile, oder auf zwei aufeinanderfolgende Zeilen verteilt (eine reine
 * Zahlenzeile, gefolgt von einer Textzeile). Kommen mehrere solche Treffer
 * vor (z.B. sowohl eine kurze interne Nummer mit Kurzbegriff als auch die
 * ausführlichere Herstellerbezeichnung, oder ein zufälliges Namens-/Orts-Feld
 * mit vorangestellter ID), gewinnt die Zeile mit der LÄNGEREN Beschreibung -
 * die ist auf einem Etikett so gut wie immer die eigentliche Produktangabe
 * und nicht eine kurze Neben-ID.
 */
function findArticleAndDescription(lines: string[]): { articleNumber?: string; description?: string } {
  const candidates: { number: string; description: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const sameLine = lines[i].match(/^(\d{5,10})\s+([A-Za-zÄÖÜäöüß].{2,})$/);
    if (sameLine) {
      candidates.push({ number: sameLine[1], description: sameLine[2].trim() });
      continue;
    }
    const bareNumber = lines[i].match(/^(\d{5,10})$/);
    const nextLine = lines[i + 1];
    if (bareNumber && nextLine && /[A-Za-zÄÖÜäöüß]{3,}/.test(nextLine)) {
      candidates.push({ number: bareNumber[1], description: nextLine });
    }
  }

  if (candidates.length === 0) return {};
  const best = candidates.reduce((a, b) => (b.description.length > a.description.length ? b : a));
  return { articleNumber: best.number, description: best.description };
}

export function parseLabelText(rawOcrText: string): ParsedLabelText {
  const raw = rawOcrText.trim();
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const quantity = findQuantity(lines, raw);
  const { articleNumber, description } = findArticleAndDescription(lines);

  return { articleNumber, description, quantity, raw };
}
