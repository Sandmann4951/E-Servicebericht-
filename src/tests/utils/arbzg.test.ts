import { describe, expect, it } from 'vitest';
import { MAX_DAILY_WORK_MINUTES, exceedsMaxDailyWork } from '../../lib/utils/arbzg';

describe('MAX_DAILY_WORK_MINUTES', () => {
  it('entspricht 10 Stunden (§3 ArbZG)', () => {
    expect(MAX_DAILY_WORK_MINUTES).toBe(600);
  });
});

describe('exceedsMaxDailyWork', () => {
  it('false bei Dauer unterhalb oder genau an der Grenze', () => {
    expect(exceedsMaxDailyWork(0)).toBe(false);
    expect(exceedsMaxDailyWork(480)).toBe(false);
    expect(exceedsMaxDailyWork(600)).toBe(false);
  });

  it('true bei Dauer über der Grenze', () => {
    expect(exceedsMaxDailyWork(601)).toBe(true);
    expect(exceedsMaxDailyWork(720)).toBe(true);
  });

  it('behandelt fehlende Werte als 0 (also nicht überschritten)', () => {
    expect(exceedsMaxDailyWork(undefined)).toBe(false);
    expect(exceedsMaxDailyWork(null)).toBe(false);
  });
});
