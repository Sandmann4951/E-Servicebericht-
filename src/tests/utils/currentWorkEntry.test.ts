import { describe, expect, it } from 'vitest';
import { pickCurrentWorkEntry } from '../../lib/utils/currentWorkEntry';
import type { TimeEntry } from '../../lib/db/types';

function entry(overrides: Partial<TimeEntry>): TimeEntry {
  return { id: crypto.randomUUID(), reportId: 'r', date: '2026-08-10', createdAt: '', updatedAt: '', ...overrides };
}

describe('pickCurrentWorkEntry', () => {
  it('nimmt den laufenden Abschnitt, auch wenn es heute schon beendete gibt', () => {
    const active = entry({ startTime: '13:00' });
    const result = pickCurrentWorkEntry([entry({ startTime: '08:00', endTime: '12:00' }), active], '2026-08-10');
    expect(result).toEqual({ entry: active, mode: 'active' });
  });

  it('nimmt ohne laufenden Abschnitt den zuletzt begonnenen von heute', () => {
    const later = entry({ startTime: '13:00', endTime: '16:00' });
    const result = pickCurrentWorkEntry([later, entry({ startTime: '08:00', endTime: '12:00' })], '2026-08-10');
    expect(result).toEqual({ entry: later, mode: 'today' });
  });

  it('bevorzugt Arbeitszeit vor der anschließenden Rückfahrt', () => {
    const work = entry({ startTime: '08:00', endTime: '15:00' });
    const result = pickCurrentWorkEntry([work, entry({ startTime: '15:00', endTime: '16:00', isTravel: true })], '2026-08-10');
    expect(result?.entry).toBe(work);
  });

  it('liefert nichts, wenn heute nichts erfasst ist (ältere Abschnitte und Pausen zählen nicht)', () => {
    const result = pickCurrentWorkEntry(
      [entry({ date: '2026-08-09', startTime: '08:00', endTime: '12:00' }), entry({ startTime: '12:00', endTime: '12:30', isBreak: true })],
      '2026-08-10'
    );
    expect(result).toBeUndefined();
  });
});
