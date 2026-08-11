import { describe, expect, it } from 'vitest';
import { computeDurationMinutes, formatDateDE, formatDurationMinutes, nowHHmm, todayISODate } from '../../lib/utils/date';

describe('computeDurationMinutes', () => {
  it('berechnet die Differenz in Minuten', () => {
    expect(computeDurationMinutes('08:00', '16:30')).toBe(510);
  });

  it('liefert undefined bei Ende vor Start', () => {
    expect(computeDurationMinutes('16:00', '08:00')).toBeUndefined();
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
