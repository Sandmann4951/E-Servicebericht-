import { describe, expect, it } from 'vitest';
import { appendDictatedText } from '../../lib/utils/dictation';

describe('appendDictatedText', () => {
  it('schreibt in ein leeres Feld groß', () => {
    expect(appendDictatedText('', 'sicherung ersetzt')).toBe('Sicherung ersetzt');
  });

  it('hängt mitten im Satz mit Leerzeichen und unverändert klein an', () => {
    expect(appendDictatedText('Sicherung ersetzt', 'und geprüft')).toBe('Sicherung ersetzt und geprüft');
  });

  it('beginnt nach einem Satzende groß', () => {
    expect(appendDictatedText('Sicherung ersetzt. ', 'anlage läuft')).toBe('Sicherung ersetzt. Anlage läuft');
  });

  it('setzt am Anfang einer neuen Zeile kein Leerzeichen davor', () => {
    expect(appendDictatedText('Erste Zeile\n', 'zweite zeile')).toBe('Erste Zeile\nZweite zeile');
  });

  it('ignoriert leeren Diktat-Text', () => {
    expect(appendDictatedText('Text', '   ')).toBe('Text');
  });
});
