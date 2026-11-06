import { beforeEach, describe, expect, it } from 'vitest';
import { resetTestDB } from '../testUtils';
import {
  getDayProjectPlan,
  listAllDayProjectPlans,
  listDayProjectPlansInRange,
  removeDayProjectPlan,
  setDayProjectPlan
} from '../../lib/db/dayProjectPlans';

beforeEach(async () => {
  await resetTestDB();
});

describe('setDayProjectPlan / getDayProjectPlan', () => {
  it('legt eine neue Tagesplanung an', async () => {
    const plan = await setDayProjectPlan('2026-08-11', '2026-001');

    expect(plan.date).toBe('2026-08-11');
    expect(plan.projectNumber).toBe('2026-001');
    expect(plan.createdAt).toBeTruthy();
    expect(plan.updatedAt).toBe(plan.createdAt);
  });

  it('liefert undefined für einen Tag ohne Planung', async () => {
    expect(await getDayProjectPlan('2026-08-11')).toBeUndefined();
  });

  it('überschreibt eine bestehende Planung für denselben Tag (Upsert statt Duplikat)', async () => {
    const first = await setDayProjectPlan('2026-08-11', '2026-001');
    const second = await setDayProjectPlan('2026-08-11', '2026-002');

    expect(second.date).toBe(first.date);
    expect(second.projectNumber).toBe('2026-002');
    // createdAt bleibt vom ersten Anlegen erhalten, nur updatedAt ändert sich.
    expect(second.createdAt).toBe(first.createdAt);

    const all = await listAllDayProjectPlans();
    expect(all).toHaveLength(1);
  });
});

describe('removeDayProjectPlan', () => {
  it('entfernt eine bestehende Tagesplanung', async () => {
    await setDayProjectPlan('2026-08-11', '2026-001');
    await removeDayProjectPlan('2026-08-11');
    expect(await getDayProjectPlan('2026-08-11')).toBeUndefined();
  });

  it('wirft nicht beim Löschen eines nicht existierenden Tages', async () => {
    await expect(removeDayProjectPlan('2026-08-11')).resolves.toBeUndefined();
  });
});

describe('listDayProjectPlansInRange', () => {
  it('liefert nur Planungen innerhalb des Bereichs, Grenzen inklusive', async () => {
    await setDayProjectPlan('2026-07-31', '2026-001');
    await setDayProjectPlan('2026-08-01', '2026-002');
    await setDayProjectPlan('2026-08-15', '2026-003');
    await setDayProjectPlan('2026-08-31', '2026-004');
    await setDayProjectPlan('2026-09-01', '2026-005');

    const result = await listDayProjectPlansInRange('2026-08-01', '2026-08-31');
    const dates = result.map((p) => p.date).sort();

    expect(dates).toEqual(['2026-08-01', '2026-08-15', '2026-08-31']);
  });

  it('liefert eine leere Liste, wenn nichts im Bereich liegt', async () => {
    await setDayProjectPlan('2026-01-01', '2026-001');
    expect(await listDayProjectPlansInRange('2026-08-01', '2026-08-31')).toEqual([]);
  });
});

describe('listAllDayProjectPlans', () => {
  it('liefert alle Planungen unabhängig vom Datum', async () => {
    await setDayProjectPlan('2026-01-01', '2026-001');
    await setDayProjectPlan('2027-12-31', '2027-050');
    expect(await listAllDayProjectPlans()).toHaveLength(2);
  });
});
