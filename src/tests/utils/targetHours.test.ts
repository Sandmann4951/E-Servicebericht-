import { beforeEach, describe, expect, it } from 'vitest';
import { resetTestDB } from '../testUtils';
import { setAbsence } from '../../lib/db/absences';
import { setBundesland, setWeeklyTargetHours } from '../../lib/settings';
import { getMonthTarget } from '../../lib/utils/targetHours';

// Gleicher In-Memory-localStorage-Stub wie in settings.test.ts - getMonthTarget()
// liest Sollstunden/Bundesland über settings.ts, das ohne echtes localStorage
// (Node-Testumgebung) sonst per try/catch auf die Standardwerte zurückfällt.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

beforeEach(async () => {
  await resetTestDB();
  (globalThis as { localStorage?: Storage }).localStorage = new MemoryStorage() as unknown as Storage;
});

describe('getMonthTarget', () => {
  it('zählt Werktage (Mo-Fr) abzüglich bundesweiter Feiertage, Standard 40 Std./Woche', async () => {
    // Dezember 2026: 23 Werktage (Mo-Fr), davon einer (25.12., 1. Weihnachtsfeiertag) ein Freitag.
    const result = await getMonthTarget('2026-12');

    expect(result.workingDays).toBe(22);
    expect(result.targetMinutes).toBe(22 * 8 * 60); // 8 Std./Tag bei 40 Std./Woche
  });

  it('rechnet mit der konfigurierten Sollstunden-pro-Woche', async () => {
    setWeeklyTargetHours(30);

    const result = await getMonthTarget('2026-12');

    expect(result.workingDays).toBe(22);
    expect(result.targetMinutes).toBe(22 * 6 * 60); // 6 Std./Tag bei 30 Std./Woche
  });

  it('zieht Urlaub von den Werktagen ab', async () => {
    // 01.12.2026 ist ein Dienstag (Werktag) - als Urlaub eingetragen zählt er nicht mehr zum Soll.
    await setAbsence('2026-12-01', 'vacation');

    const result = await getMonthTarget('2026-12');

    expect(result.workingDays).toBe(21);
  });

  it('zieht auch Krank von den Werktagen ab', async () => {
    await setAbsence('2026-12-01', 'sick');

    const result = await getMonthTarget('2026-12');

    expect(result.workingDays).toBe(21);
  });

  it('zieht Zeitausgleich NICHT von den Werktagen ab (baut Überstunden über eine niedrigere Ist-Zeit ab, nicht über ein gesenktes Soll)', async () => {
    await setAbsence('2026-12-01', 'timeoff');

    const result = await getMonthTarget('2026-12');

    expect(result.workingDays).toBe(22);
  });

  it('berücksichtigt landesspezifische Feiertage nur, wenn ein Bundesland gesetzt ist', async () => {
    // Fronleichnam 2026 fällt auf Donnerstag, 04.06. - nur in einigen Bundesländern (u.a. Bayern) ein Feiertag.
    const withoutState = await getMonthTarget('2026-06');
    expect(withoutState.workingDays).toBe(22);

    setBundesland('BY');
    const withBayern = await getMonthTarget('2026-06');
    expect(withBayern.workingDays).toBe(21);
  });
});
