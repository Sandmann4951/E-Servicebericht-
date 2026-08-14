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

  it('Soll bleibt fix bei Urlaub - Urlaubstage senken das Soll NICHT, sondern werden als Ist angerechnet', async () => {
    // 01.12.2026 ist ein Dienstag (Werktag).
    await setAbsence('2026-12-01', 'vacation');

    const result = await getMonthTarget('2026-12');

    expect(result.workingDays).toBe(22);
    expect(result.targetMinutes).toBe(22 * 8 * 60);
    expect(result.creditedAbsenceDays).toBe(1);
    expect(result.creditedAbsenceMinutes).toBe(8 * 60);
  });

  it('rechnet auch Krank als Ist-Zeit an', async () => {
    await setAbsence('2026-12-01', 'sick');
    await setAbsence('2026-12-02', 'sick');

    const result = await getMonthTarget('2026-12');

    expect(result.creditedAbsenceDays).toBe(2);
    expect(result.creditedAbsenceMinutes).toBe(2 * 8 * 60);
  });

  it('rechnet Zeitausgleich NICHT an (baut Überstunden über eine niedrigere tatsächliche Ist-Zeit ab, nicht über eine Gutschrift)', async () => {
    await setAbsence('2026-12-01', 'timeoff');

    const result = await getMonthTarget('2026-12');

    expect(result.creditedAbsenceDays).toBe(0);
    expect(result.creditedAbsenceMinutes).toBe(0);
  });

  it('rechnet einen Urlaubstag an einem Wochenende/Feiertag NICHT an (dort gäbe es ohnehin kein Soll)', async () => {
    // 05.12.2026 ist ein Samstag.
    await setAbsence('2026-12-05', 'vacation');
    // 25.12.2026 ist ein Feiertag (1. Weihnachtsfeiertag), fällt auf einen Freitag.
    await setAbsence('2026-12-25', 'vacation');

    const result = await getMonthTarget('2026-12');

    expect(result.creditedAbsenceDays).toBe(0);
    expect(result.creditedAbsenceMinutes).toBe(0);
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
