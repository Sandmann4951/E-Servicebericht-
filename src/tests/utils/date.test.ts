import { describe, expect, it } from 'vitest';
import {
  addMinutesToTime,
  computeDurationMinutes,
  formatDateDE,
  formatDurationMinutes,
  nowHHmm,
  startOfWeekISO,
  todayISODate
} from '../../lib/utils/date';

describe('computeDurationMinutes', () => {
  it('berechnet die Differenz in Minuten', () => {
    expect(computeDurationMinutes('08:00', '16:30')).toBe(510);
  });

  it('interpretiert eine Endzeit vor der Startzeit als Zeitspanne über Mitternacht', () => {
    // 19:05 bis 12:16 (nächster Tag) - z.B. vergessenes Auschecken über Nacht
    expect(computeDurationMinutes('19:05', '12:16')).toBe(17 * 60 + 11);
    expect(computeDurationMinutes('16:00', '08:00')).toBe(16 * 60);
  });

  it('liefert 0 bei identischer Start-/Endzeit', () => {
    expect(computeDurationMinutes('08:00', '08:00')).toBe(0);
  });

  it('liefert undefined bei ungültigem Format', () => {
    expect(computeDurationMinutes('8h', '10:00')).toBeUndefined();
  });
});

describe('formatDurationMinutes', () => {
  it('formatiert Stunden und Minuten mit führender Null', () => {
    expect(formatDurationMinutes(90)).toBe('1:30 Std.');
    expect(formatDurationMinutes(5)).toBe('0:05 Std.');
  });

  it('behandelt fehlende/negative Werte als 0', () => {
    expect(formatDurationMinutes(undefined)).toBe('0:00 Std.');
    expect(formatDurationMinutes(-10)).toBe('0:00 Std.');
  });
});

describe('formatDateDE', () => {
  it('wandelt ISO-Datum in deutsches Format um', () => {
    expect(formatDateDE('2026-08-10')).toBe('10.08.2026');
  });
});

describe('todayISODate', () => {
  it('liefert das heutige Datum im lokalen "YYYY-MM-DD"-Format', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(todayISODate()).toBe(expected);
  });
});

describe('nowHHmm', () => {
  it('liefert die aktuelle Uhrzeit im Format "HH:mm"', () => {
    expect(nowHHmm()).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('addMinutesToTime', () => {
  it('addiert Minuten innerhalb desselben Tages', () => {
    expect(addMinutesToTime('08:00', 90)).toBe('09:30');
    expect(addMinutesToTime('06:00', 600)).toBe('16:00');
  });

  it('wraps über Mitternacht (Modulo 24h)', () => {
    expect(addMinutesToTime('22:00', 600)).toBe('08:00');
    expect(addMinutesToTime('23:30', 60)).toBe('00:30');
  });

  it('liefert die Eingabe unverändert bei ungültigem Format', () => {
    expect(addMinutesToTime('nicht-valide', 60)).toBe('nicht-valide');
  });
});

describe('startOfWeekISO', () => {
  it('liefert für einen Mittwoch den Montag derselben Woche', () => {
    // 2026-08-12 ist ein Mittwoch.
    expect(startOfWeekISO('2026-08-12')).toBe('2026-08-10');
  });

  it('liefert für einen Montag denselben Tag', () => {
    expect(startOfWeekISO('2026-08-10')).toBe('2026-08-10');
  });

  it('liefert für einen Sonntag den Montag DAVOR (nicht denselben Tag)', () => {
    // 2026-08-16 ist ein Sonntag - gehört noch zur Woche, die am 2026-08-10 (Montag) begann.
    expect(startOfWeekISO('2026-08-16')).toBe('2026-08-10');
  });

  it('rechnet über einen Monatswechsel hinweg korrekt', () => {
    // 2026-09-01 ist ein Dienstag, die Woche begann am 2026-08-31 (Montag).
    expect(startOfWeekISO('2026-09-01')).toBe('2026-08-31');
  });
});
