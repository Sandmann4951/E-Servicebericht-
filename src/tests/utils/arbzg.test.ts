import { describe, expect, it } from 'vitest';
import {
  MANDATORY_BREAK_MINUTES,
  MAX_DAILY_CLOCKED_MINUTES,
  MAX_DAILY_WORK_MINUTES,
  exceedsMaxDailyWork
} from '../../lib/utils/arbzg';

describe('MAX_DAILY_WORK_MINUTES', () => {
  it('entspricht 10 Stunden (§3 ArbZG)', () => {
    expect(MAX_DAILY_WORK_MINUTES).toBe(600);
  });
});

describe('MANDATORY_BREAK_MINUTES', () => {
  it('entspricht 45 Minuten (§4 ArbZG - 0,5h nach 6 Std. + 0,25h weitere nach 9 Std., insgesamt)', () => {
    expect(MANDATORY_BREAK_MINUTES).toBe(45);
  });
});

describe('MAX_DAILY_CLOCKED_MINUTES', () => {
  it('entspricht Höchstarbeitszeit + Pflichtpause = 10 Std. 45 Min.', () => {
    expect(MAX_DAILY_CLOCKED_MINUTES).toBe(MAX_DAILY_WORK_MINUTES + MANDATORY_BREAK_MINUTES);
    expect(MAX_DAILY_CLOCKED_MINUTES).toBe(645);
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
