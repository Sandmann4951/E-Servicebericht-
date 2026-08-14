import { describe, expect, it } from 'vitest';
import { computeDayStatus } from '../../lib/utils/calendarDay';

describe('computeDayStatus', () => {
  it('liefert "vacation" für einen Urlaubstag', () => {
    expect(
      computeDayStatus({ date: '2026-08-11', isHoliday: false, absenceType: 'vacation', hasBookedTime: false })
    ).toBe('vacation');
  });

  it('liefert "sick" für einen Kranktag', () => {
    expect(computeDayStatus({ date: '2026-08-11', isHoliday: false, absenceType: 'sick', hasBookedTime: false })).toBe(
      'sick'
    );
  });

  it('liefert "timeoff" für einen Zeitausgleich-Tag', () => {
    expect(
      computeDayStatus({ date: '2026-08-11', isHoliday: false, absenceType: 'timeoff', hasBookedTime: false })
    ).toBe('timeoff');
  });

  it('liefert "holiday" für einen Feiertag ohne Abwesenheit', () => {
    expect(computeDayStatus({ date: '2026-12-25', isHoliday: true, hasBookedTime: false })).toBe('holiday');
  });

  it('liefert "booked" für einen Werktag mit gebuchter Zeit', () => {
    expect(computeDayStatus({ date: '2026-08-11', isHoliday: false, hasBookedTime: true })).toBe('booked');
  });

  it('liefert "weekend" für einen Samstag/Sonntag ohne Feiertag/Abwesenheit/Buchung', () => {
    expect(computeDayStatus({ date: '2026-08-15', isHoliday: false, hasBookedTime: false })).toBe('weekend'); // Samstag
    expect(computeDayStatus({ date: '2026-08-16', isHoliday: false, hasBookedTime: false })).toBe('weekend'); // Sonntag
  });

  it('liefert "open" für einen normalen Werktag ohne alles andere', () => {
    expect(computeDayStatus({ date: '2026-08-11', isHoliday: false, hasBookedTime: false })).toBe('open'); // Dienstag
  });

  it('Abwesenheit gewinnt gegen Feiertag', () => {
    expect(
      computeDayStatus({ date: '2026-12-25', isHoliday: true, absenceType: 'vacation', hasBookedTime: false })
    ).toBe('vacation');
  });

  it('Abwesenheit gewinnt gegen Wochenende', () => {
    expect(
      computeDayStatus({ date: '2026-08-15', isHoliday: false, absenceType: 'sick', hasBookedTime: false })
    ).toBe('sick');
  });

  it('Feiertag gewinnt gegen gebuchte Zeit', () => {
    expect(computeDayStatus({ date: '2026-12-25', isHoliday: true, hasBookedTime: true })).toBe('holiday');
  });

  it('gebuchte Zeit gewinnt gegen Wochenende (z.B. Notdienst am Samstag)', () => {
    expect(computeDayStatus({ date: '2026-08-15', isHoliday: false, hasBookedTime: true })).toBe('booked');
  });
});
