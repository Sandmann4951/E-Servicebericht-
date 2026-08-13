import { describe, expect, it } from 'vitest';
import { computeEasterSunday, getGermanHolidays, isGermanHoliday } from '../../lib/utils/holidays';

function toISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

describe('computeEasterSunday', () => {
  it('trifft bekannte Ostersonntage exakt', () => {
    expect(toISO(computeEasterSunday(2023))).toBe('2023-04-09');
    expect(toISO(computeEasterSunday(2024))).toBe('2024-03-31');
    expect(toISO(computeEasterSunday(2025))).toBe('2025-04-20');
    expect(toISO(computeEasterSunday(2026))).toBe('2026-04-05');
    expect(toISO(computeEasterSunday(2027))).toBe('2027-03-28');
  });
});

describe('getGermanHolidays', () => {
  it('liefert ohne Bundesland nur die neun bundesweiten Feiertage', () => {
    const holidays = getGermanHolidays(2026);
    expect(holidays.size).toBe(9);
    expect(holidays.get('2026-01-01')).toBe('Neujahr');
    expect(holidays.get('2026-04-03')).toBe('Karfreitag');
    expect(holidays.get('2026-04-06')).toBe('Ostermontag');
    expect(holidays.get('2026-05-01')).toBe('Tag der Arbeit');
    expect(holidays.get('2026-05-14')).toBe('Christi Himmelfahrt');
    expect(holidays.get('2026-05-25')).toBe('Pfingstmontag');
    expect(holidays.get('2026-10-03')).toBe('Tag der Deutschen Einheit');
    expect(holidays.get('2026-12-25')).toBe('1. Weihnachtsfeiertag');
    expect(holidays.get('2026-12-26')).toBe('2. Weihnachtsfeiertag');
  });

  it('ergänzt in Bayern Heilige Drei Könige, Fronleichnam, Mariä Himmelfahrt und Allerheiligen', () => {
    const holidays = getGermanHolidays(2026, 'BY');
    expect(holidays.get('2026-01-06')).toBe('Heilige Drei Könige');
    expect(holidays.get('2026-06-04')).toBe('Fronleichnam');
    expect(holidays.get('2026-08-15')).toBe('Mariä Himmelfahrt');
    expect(holidays.get('2026-11-01')).toBe('Allerheiligen');
    // 9 bundesweite + 4 bayernspezifische.
    expect(holidays.size).toBe(13);
  });

  it('ergänzt in Nordrhein-Westfalen Fronleichnam und Allerheiligen, aber nicht Heilige Drei Könige', () => {
    const holidays = getGermanHolidays(2026, 'NW');
    expect(holidays.has('2026-01-06')).toBe(false);
    expect(holidays.get('2026-06-04')).toBe('Fronleichnam');
    expect(holidays.get('2026-11-01')).toBe('Allerheiligen');
  });

  it('ergänzt in Sachsen den Reformationstag, aber keine katholisch geprägten Feiertage', () => {
    const holidays = getGermanHolidays(2026, 'SN');
    expect(holidays.get('2026-10-31')).toBe('Reformationstag');
    expect(holidays.has('2026-06-04')).toBe(false);
    expect(holidays.has('2026-11-01')).toBe(false);
  });

  it('Berlin hat nur die neun bundesweiten Feiertage', () => {
    const holidays = getGermanHolidays(2026, 'BE');
    expect(holidays.size).toBe(9);
  });
});

describe('isGermanHoliday', () => {
  it('erkennt einen bundesweiten Feiertag', () => {
    expect(isGermanHoliday('2026-12-25')).toBe(true);
  });

  it('erkennt einen normalen Werktag nicht als Feiertag', () => {
    expect(isGermanHoliday('2026-08-12')).toBe(false);
  });

  it('berücksichtigt das Bundesland', () => {
    expect(isGermanHoliday('2026-11-01', 'NW')).toBe(true);
    expect(isGermanHoliday('2026-11-01', 'BE')).toBe(false);
    expect(isGermanHoliday('2026-11-01')).toBe(false);
  });
});
