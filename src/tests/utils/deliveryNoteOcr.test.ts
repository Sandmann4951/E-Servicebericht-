import { describe, expect, it } from 'vitest';
import { parseDeliveryNoteText } from '../../lib/utils/deliveryNoteOcr';

describe('parseDeliveryNoteText', () => {
  it('erkennt mehrere Positionen aus einem realistischen Lieferschein (Menge auf eigener Zeile, Menge fehlt bei der letzten Position)', () => {
    const raw = [
      'Lieferschein Nr. 445566',
      'Datum 03.09.2026',
      '',
      '5912361 DEHN DG MP TNS 275 Überspannungsableiter Typ 2 DEHNguard',
      '2 Stk',
      '',
      '7451122 Kabel NYM-J 3x1,5mm² 100m Ring',
      '1 Stk',
      '',
      '8812233 Schutzschalter B16'
    ].join('\n');

    const result = parseDeliveryNoteText(raw);

    expect(result).toEqual([
      { articleNumber: '5912361', description: 'DEHN DG MP TNS 275 Überspannungsableiter Typ 2 DEHNguard', quantity: 2 },
      { articleNumber: '7451122', description: 'Kabel NYM-J 3x1,5mm² 100m Ring', quantity: 1 },
      { articleNumber: '8812233', description: 'Schutzschalter B16', quantity: undefined }
    ]);
  });

  it('erkennt eine direkt an die Beschreibung angehängte Menge in derselben Zeile', () => {
    const result = parseDeliveryNoteText('7451122 Kabel NYM-J 3x1,5mm² 2 Stk');
    expect(result).toEqual([{ articleNumber: '7451122', description: 'Kabel NYM-J 3x1,5mm²', quantity: 2 }]);
  });

  it('erkennt Artikelnummer + Beschreibung auch ohne jede erkennbare Menge', () => {
    const result = parseDeliveryNoteText('99999999 Ware ohne Mengenangabe');
    expect(result).toEqual([{ articleNumber: '99999999', description: 'Ware ohne Mengenangabe', quantity: undefined }]);
  });

  it('verwechselt eine alleinstehende Mengen-Zeile nicht mit der Beschreibung der vorherigen Position', () => {
    const result = parseDeliveryNoteText('5912361\n3 Stk');
    expect(result).toEqual([]);
  });

  it('liefert eine leere Liste, wenn gar nichts erkennbar ist (kein Fehler)', () => {
    expect(parseDeliveryNoteText('nur irgendein text ohne struktur')).toEqual([]);
    expect(parseDeliveryNoteText('')).toEqual([]);
  });

  it('erkennt mehrere Positionen ohne jede Mengenangabe unabhängig voneinander', () => {
    const raw = '11112222 Erste Position\n33334444 Zweite Position';
    const result = parseDeliveryNoteText(raw);
    expect(result).toEqual([
      { articleNumber: '11112222', description: 'Erste Position', quantity: undefined },
      { articleNumber: '33334444', description: 'Zweite Position', quantity: undefined }
    ]);
  });
});
