import { describe, expect, it } from 'vitest';
import { appendPerformedWorkLine, applyNoteLine, formatTimeEntryPerformedWorkLine } from '../../lib/utils/performedWorkNote';

describe('formatTimeEntryPerformedWorkLine', () => {
  it('formatiert Datum, Zeitspanne und Notiz-Text', () => {
    const line = formatTimeEntryPerformedWorkLine({ date: '2026-08-10', startTime: '08:00', endTime: '12:00' }, 'Sicherung ersetzt');
    expect(line).toBe('10.08.2026, 08:00–12:00: Sicherung ersetzt');
  });

  it('lässt die Zeitspanne weg, wenn Start/Ende fehlen', () => {
    const line = formatTimeEntryPerformedWorkLine({ date: '2026-08-10' }, 'Sicherung ersetzt');
    expect(line).toBe('10.08.2026: Sicherung ersetzt');
  });
});

describe('appendPerformedWorkLine', () => {
  it('befüllt ein vorher leeres Feld einfach mit der einen Zeile', () => {
    expect(appendPerformedWorkLine(undefined, '10.08.2026, 08:00–12:00: Sicherung ersetzt')).toBe(
      '10.08.2026, 08:00–12:00: Sicherung ersetzt'
    );
  });

  it('hängt an einen bestehenden Text eine neue Zeile an, statt ihn zu ersetzen', () => {
    const result = appendPerformedWorkLine('Zählerschrank geprüft.', '10.08.2026, 08:00–12:00: Sicherung ersetzt');
    expect(result).toBe('Zählerschrank geprüft.\n10.08.2026, 08:00–12:00: Sicherung ersetzt');
  });

  it('mehrere Zeiteintrag-Notizen landen in der richtigen Reihenfolge untereinander', () => {
    let performedWork: string | undefined;
    performedWork = appendPerformedWorkLine(performedWork, '09.08.2026, 08:00–12:00: Erste Notiz');
    performedWork = appendPerformedWorkLine(performedWork, '10.08.2026, 08:00–12:00: Zweite Notiz');
    performedWork = appendPerformedWorkLine(performedWork, '11.08.2026, 08:00–12:00: Dritte Notiz');
    expect(performedWork).toBe(
      '09.08.2026, 08:00–12:00: Erste Notiz\n10.08.2026, 08:00–12:00: Zweite Notiz\n11.08.2026, 08:00–12:00: Dritte Notiz'
    );
  });
});

describe('applyNoteLine', () => {
  const OLD = '10.08.2026: Sicherung ersetzt';
  const NEW = '10.08.2026, 08:00–12:00: Sicherung ersetzt';

  it('hängt eine noch nie geschriebene Zeile an', () => {
    expect(applyNoteLine('Zählerschrank geprüft.', undefined, NEW)).toBe(`Zählerschrank geprüft.\n${NEW}`);
    expect(applyNoteLine(undefined, undefined, NEW)).toBe(NEW);
  });

  it('hängt nicht doppelt an, wenn genau diese Zeile schon dasteht (z.B. alte Sicherung wiederhergestellt)', () => {
    expect(applyNoteLine(`Vorher\n${NEW}`, undefined, NEW)).toBe(`Vorher\n${NEW}`);
  });

  it('ersetzt die bisherige Zeile an Ort und Stelle (laufender Abschnitt wurde ausgecheckt)', () => {
    expect(applyNoteLine(`Vorher\n${OLD}\nNachher`, OLD, NEW)).toBe(`Vorher\n${NEW}\nNachher`);
  });

  it('entfernt die Zeile, wenn die Notiz geleert wurde', () => {
    expect(applyNoteLine(`Vorher\n${OLD}`, OLD, undefined)).toBe('Vorher');
    expect(applyNoteLine(OLD, OLD, undefined)).toBe('');
  });

  it('lässt von Hand umformulierten Text unangetastet', () => {
    const edited = 'Sicherung im Zählerschrank getauscht (von Hand umformuliert)';
    expect(applyNoteLine(edited, OLD, NEW)).toBe(edited);
    expect(applyNoteLine(edited, OLD, undefined)).toBe(edited);
  });

  it('ändert nichts, wenn alte und neue Zeile gleich sind', () => {
    expect(applyNoteLine(`A\n${OLD}`, OLD, OLD)).toBe(`A\n${OLD}`);
  });
});

describe('formatTimeEntryPerformedWorkLine - Zeilenumbrüche', () => {
  it('macht aus einer mehrzeiligen Notiz eine einzige Zeile', () => {
    expect(formatTimeEntryPerformedWorkLine({ date: '2026-08-10' }, 'Erste Zeile\nZweite Zeile')).toBe('10.08.2026: Erste Zeile Zweite Zeile');
  });
});
