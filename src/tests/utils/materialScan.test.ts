import { describe, expect, it } from 'vitest';
import { parseScannedMaterialLabel } from '../../lib/utils/materialScan';

/** FNC1/GS-Steuerzeichen (0x1D), mit dem GS1-Element-Strings variabel lange Felder trennen. */
const GS = '\u001D';

describe('parseScannedMaterialLabel', () => {
  it('erkennt eine menschenlesbare GS1-Klammer-Schreibweise (GTIN + Stückzahl)', () => {
    const result = parseScannedMaterialLabel('(01)04012345123456(30)5');
    expect(result).toEqual({ articleNumber: '04012345123456', quantity: 5, raw: '(01)04012345123456(30)5' });
  });

  it('bevorzugt AI 240 (Zusatz-ID des Herstellers/Lieferanten) als Artikelnummer vor der GTIN', () => {
    const result = parseScannedMaterialLabel('(01)04012345123456(240)5912361(37)1');
    expect(result.articleNumber).toBe('5912361');
    expect(result.quantity).toBe(1);
  });

  it('bevorzugt AI 241 (Kunden-Teilenummer) vor der GTIN, wenn kein 240 vorhanden ist', () => {
    const result = parseScannedMaterialLabel('(01)04012345123456(241)ABC-123');
    expect(result.articleNumber).toBe('ABC-123');
  });

  it('erkennt einen rohen GS1-Element-String mit FNC1/GS-Trennzeichen zwischen variabel langen Feldern', () => {
    // GTIN (fest 14-stellig, kein Trennzeichen nötig) + Zusatz-ID (240, variabel - ohne
    // GS-Trennzeichen davor/danach würde die Menge sonst als Teil von 240 verschluckt) + Menge (30).
    const raw = `0104012345123456240591236${GS}305`;
    const result = parseScannedMaterialLabel(raw);
    expect(result.articleNumber).toBe('591236');
    expect(result.quantity).toBe(5);
  });

  it('liefert ein Teilergebnis, wenn der Element-String nach einem GS-Trennzeichen an einem unbekannten AI abbricht', () => {
    const raw = `2405912361${GS}999abc`; // "999" ist kein bekannter AI in unserer Liste
    const result = parseScannedMaterialLabel(raw);
    expect(result.articleNumber).toBe('5912361');
    expect(result.raw).toBe(raw);
  });

  it('füllt die Beschreibung NIE automatisch - GS1-Codes tragen keinen Freitext', () => {
    const result = parseScannedMaterialLabel('(01)04012345123456(30)5');
    expect(result).not.toHaveProperty('description');
  });

  it('erkennt bei einem Nicht-GS1-Code die Stückzahl anhand gängiger Einheiten-Muster (Fallback)', () => {
    expect(parseScannedMaterialLabel('Menge: 3 Stk Art. 7451122').quantity).toBe(3);
    expect(parseScannedMaterialLabel('12 STK').quantity).toBe(12);
    expect(parseScannedMaterialLabel('2 pcs').quantity).toBe(2);
  });

  it('erkennt bei einem Nicht-GS1-Code eine plausible Artikelnummer anhand der Ziffernfolge (Fallback)', () => {
    expect(parseScannedMaterialLabel('Sonepar 7451122 Lieferung').articleNumber).toBe('7451122');
  });

  it('liefert nur den Rohtext, wenn gar nichts erkennbar ist', () => {
    const result = parseScannedMaterialLabel('DEHNguard Typ 2');
    expect(result).toEqual({ raw: 'DEHNguard Typ 2', articleNumber: undefined, quantity: undefined });
  });

  it('ignoriert eine Menge von 0 als unplausibel', () => {
    expect(parseScannedMaterialLabel('(30)0').quantity).toBeUndefined();
  });

  it('trimmt den rohen Scan-Text vor der Auswertung', () => {
    expect(parseScannedMaterialLabel('  (30)2  ').raw).toBe('(30)2');
  });
});
