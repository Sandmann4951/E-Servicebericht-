import { describe, expect, it } from 'vitest';
import { parseLabelText } from '../../lib/utils/labelOcr';

describe('parseLabelText', () => {
  it('erkennt Artikelnummer, Beschreibung und Menge aus einem realistischen Sonepar-Etikett (Nummer+Text auf zwei Zeilen)', () => {
    const raw = [
      'C71-08-014-04',
      'LW LW C71',
      '1000163244 2',
      '02.09.2026 15:10',
      '101118495 Überspannungsableiter',
      '5912361',
      'DEHN DG MP TNS 275 Überspannungsableiter Typ 2 DEHNguard',
      '0207147346',
      '000016 LAGER',
      'Elsa CNC Service G',
      '1 ST',
      'SORT1 42 SORT2 66 SORT3 22 SORT4 04',
      '1033634245 Sander'
    ].join('\n');

    const result = parseLabelText(raw);

    expect(result.articleNumber).toBe('5912361');
    expect(result.description).toBe('DEHN DG MP TNS 275 Überspannungsableiter Typ 2 DEHNguard');
    expect(result.quantity).toBe(1);
    expect(result.raw).toBe(raw);
  });

  it('erkennt Artikelnummer + Beschreibung, wenn beide in derselben Zeile stehen', () => {
    const result = parseLabelText('7451122 Kabel NYM-J 3x1,5mm² 100m Ring');
    expect(result.articleNumber).toBe('7451122');
    expect(result.description).toBe('Kabel NYM-J 3x1,5mm² 100m Ring');
  });

  it('erkennt eine alleinstehende Mengen-Zeile bevorzugt vor einem Treffer im Fließtext', () => {
    expect(parseLabelText('12345678 Testartikel\n3 Stk').quantity).toBe(3);
    expect(parseLabelText('99999999 Ware\n2 STK').quantity).toBe(2);
  });

  it('erkennt gängige Mengeneinheiten-Schreibweisen', () => {
    expect(parseLabelText('5 ST').quantity).toBe(5);
    expect(parseLabelText('5 Stk').quantity).toBe(5);
    expect(parseLabelText('5 Stück').quantity).toBe(5);
    expect(parseLabelText('5 pcs').quantity).toBe(5);
  });

  it('bevorzugt bei mehreren Zahl+Text-Kandidaten die Zeile mit der längeren (aussagekräftigeren) Beschreibung', () => {
    const raw = '1033634245 Sander\n5912361 DEHN DG MP TNS 275 Überspannungsableiter Typ 2 DEHNguard';
    const result = parseLabelText(raw);
    expect(result.articleNumber).toBe('5912361');
    expect(result.description).toContain('DEHNguard');
  });

  it('liefert nur den Rohtext, wenn gar nichts erkennbar ist', () => {
    const result = parseLabelText('nur irgendein text ohne struktur');
    expect(result).toEqual({ raw: 'nur irgendein text ohne struktur', articleNumber: undefined, description: undefined, quantity: undefined });
  });

  it('trimmt den rohen OCR-Text vor der Auswertung', () => {
    expect(parseLabelText('  5 ST  \n').raw).toBe('5 ST');
  });

  it('ignoriert eine Zeile, deren "Beschreibung" nicht mit einem Buchstaben beginnt', () => {
    // z.B. eine reine Datums-/Zahlenzeile wie "1000163244 2" - keine Artikelzeile.
    const result = parseLabelText('1000163244 2');
    expect(result.articleNumber).toBeUndefined();
    expect(result.description).toBeUndefined();
  });
});
