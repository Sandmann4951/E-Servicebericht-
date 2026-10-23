import { describe, expect, it } from 'vitest';
import { buildTimesheetRows, formatDecimalHours } from '../../lib/export/timesheetRows';
import type { TimeEntry } from '../../lib/db/types';
import { computeDurationMinutes } from '../../lib/utils/date';

let counter = 0;
function entry(date: string, startTime: string, endTime: string | undefined, extra: Partial<TimeEntry> = {}): TimeEntry {
  counter += 1;
  return {
    id: `e${counter}`,
    reportId: 'r1',
    date,
    startTime,
    endTime,
    durationMinutes: endTime ? computeDurationMinutes(startTime, endTime) : undefined,
    createdAt: `2026-10-19T00:00:${String(counter).padStart(2, '0')}.000Z`,
    updatedAt: '2026-10-19T00:00:00.000Z',
    ...extra
  };
}

describe('formatDecimalHours', () => {
  it('formatiert Minuten als Dezimalstunden mit Komma', () => {
    expect(formatDecimalHours(450)).toBe('7,50');
    expect(formatDecimalHours(20)).toBe('0,33');
    expect(formatDecimalHours(0)).toBe('0,00');
  });
});

describe('buildTimesheetRows', () => {
  it('fasst einen Tag mit Hinfahrt, Arbeit mit Pause und Rückfahrt zu einer Zeile zusammen', () => {
    const entries = [
      entry('2026-10-19', '07:00', '08:00', { isTravel: true, kilometers: 42 }),
      entry('2026-10-19', '08:00', '12:00'),
      entry('2026-10-19', '12:30', '16:00'),
      entry('2026-10-19', '16:00', '17:00', { isTravel: true, kilometers: 40.5 })
    ];
    const breaks = [entry('2026-10-19', '12:00', '12:30', { isBreak: true, reportId: undefined })];
    const { rows, totals } = buildTimesheetRows(entries, breaks, 'Daniel Sander');

    expect(rows).toEqual([
      {
        date: '19.10.2026',
        technician: 'Daniel Sander',
        outboundTravel: '1,00',
        outboundKm: '42',
        from: '08:00',
        to: '16:00',
        hours: '7,50',
        // 1 + 7,5 + 1 = 9,5 Std. -> 1,5 Ü-Std.
        overtime: '1,50',
        pause: '0,50',
        returnTravel: '1,00',
        returnKm: '40,5'
      }
    ]);
    expect(totals).toEqual({
      outboundTravel: '1,00',
      outboundKm: '42',
      hours: '7,50',
      overtime: '1,50',
      returnTravel: '1,00',
      returnKm: '40,5'
    });
  });

  it('zählt zwei Einsätze am selben Tag zusammen (zwei Hin- und zwei Rückfahrten)', () => {
    const entries = [
      entry('2026-10-19', '07:00', '07:30', { isTravel: true, kilometers: 10 }),
      entry('2026-10-19', '07:30', '09:30'),
      entry('2026-10-19', '09:30', '10:00', { isTravel: true, kilometers: 10 }),
      entry('2026-10-19', '13:00', '13:30', { isTravel: true, kilometers: 12 }),
      entry('2026-10-19', '13:30', '15:00'),
      entry('2026-10-19', '15:00', '15:30', { isTravel: true, kilometers: 12 })
    ];
    const [row] = buildTimesheetRows(entries, [], undefined).rows;
    expect(row.outboundTravel).toBe('1,00');
    expect(row.outboundKm).toBe('22');
    expect(row.returnTravel).toBe('1,00');
    expect(row.returnKm).toBe('22');
    expect(row.from).toBe('07:30');
    expect(row.to).toBe('15:00');
    expect(row.hours).toBe('3,50');
    expect(row.overtime).toBe('');
    expect(row.technician).toBe('');
  });

  it('ignoriert noch laufende Einträge und Pausen anderer Tage, sortiert die Tage aufsteigend', () => {
    const entries = [entry('2026-10-21', '08:00', '12:00'), entry('2026-10-20', '08:00', '10:00'), entry('2026-10-21', '13:00', undefined)];
    const breaks = [entry('2026-10-22', '09:00', '09:30', { isBreak: true, reportId: undefined })];
    const { rows, totals } = buildTimesheetRows(entries, breaks, 'X');
    expect(rows.map((row) => [row.date, row.hours, row.to, row.pause])).toEqual([
      ['20.10.2026', '2,00', '10:00', ''],
      ['21.10.2026', '4,00', '12:00', '']
    ]);
    expect(totals.hours).toBe('6,00');
    expect(totals.outboundKm).toBe('0');
  });
});
