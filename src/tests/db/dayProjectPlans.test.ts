import { beforeEach, describe, expect, it } from 'vitest';
import { resetTestDB } from '../testUtils';
import {
  addDayProjectPlan,
  listAllDayProjectPlans,
  listDayProjectPlansForDate,
  listDayProjectPlansInRange,
  removeDayProjectPlan
} from '../../lib/db/dayProjectPlans';

beforeEach(async () => {
  await resetTestDB();
});

describe('addDayProjectPlan', () => {
  it('legt eine neue Tagesplanung an', async () => {
    const plan = await addDayProjectPlan('2026-08-11', '2026-001');

    expect(plan.id).toBeTruthy();
    expect(plan.date).toBe('2026-08-11');
    expect(plan.projectNumber).toBe('2026-001');
    expect(plan.createdAt).toBeTruthy();
    expect(plan.updatedAt).toBe(plan.createdAt);
  });

  it('erlaubt mehrere unterschiedliche Projekte am selben Tag', async () => {
    await addDayProjectPlan('2026-08-11', '2026-001');
    await addDayProjectPlan('2026-08-11', '2026-002');

    const plans = await listDayProjectPlansForDate('2026-08-11');
    expect(plans.map((p) => p.projectNumber)).toEqual(['2026-001', '2026-002']);
  });

  it('legt dieselbe Projektnummer am selben Tag nicht doppelt an (liefert den bestehenden Eintrag zurück)', async () => {
    const first = await addDayProjectPlan('2026-08-11', '2026-001');
    const second = await addDayProjectPlan('2026-08-11', '2026-001');

    expect(second.id).toBe(first.id);
    const plans = await listDayProjectPlansForDate('2026-08-11');
    expect(plans).toHaveLength(1);
  });

  it('erlaubt dieselbe Projektnummer an unterschiedlichen Tagen', async () => {
    await addDayProjectPlan('2026-08-11', '2026-001');
    await addDayProjectPlan('2026-08-12', '2026-001');

    expect(await listAllDayProjectPlans()).toHaveLength(2);
  });
});

describe('removeDayProjectPlan', () => {
  it('entfernt eine einzelne Planung per id, ohne andere Planungen desselben Tages zu entfernen', async () => {
    const a = await addDayProjectPlan('2026-08-11', '2026-001');
    const b = await addDayProjectPlan('2026-08-11', '2026-002');

    await removeDayProjectPlan(a.id);

    const remaining = await listDayProjectPlansForDate('2026-08-11');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(b.id);
  });

  it('wirft nicht beim Löschen einer nicht existierenden id', async () => {
    await expect(removeDayProjectPlan('does-not-exist')).resolves.toBeUndefined();
  });
});

describe('listDayProjectPlansForDate', () => {
  it('liefert eine leere Liste für einen Tag ohne Planung', async () => {
    expect(await listDayProjectPlansForDate('2026-08-11')).toEqual([]);
  });

  it('sortiert aufsteigend nach Anlagezeitpunkt (zuerst hinzugefügt = zuerst in der Liste)', async () => {
    const first = await addDayProjectPlan('2026-08-11', '2026-001');
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await addDayProjectPlan('2026-08-11', '2026-002');

    const plans = await listDayProjectPlansForDate('2026-08-11');
    expect(plans.map((p) => p.id)).toEqual([first.id, second.id]);
  });
});

describe('listDayProjectPlansInRange', () => {
  it('liefert nur Planungen innerhalb des Bereichs, Grenzen inklusive', async () => {
    await addDayProjectPlan('2026-07-31', '2026-001');
    await addDayProjectPlan('2026-08-01', '2026-002');
    await addDayProjectPlan('2026-08-15', '2026-003');
    await addDayProjectPlan('2026-08-15', '2026-004');
    await addDayProjectPlan('2026-08-31', '2026-005');
    await addDayProjectPlan('2026-09-01', '2026-006');

    const result = await listDayProjectPlansInRange('2026-08-01', '2026-08-31');
    const dates = result.map((p) => p.date).sort();

    expect(dates).toEqual(['2026-08-01', '2026-08-15', '2026-08-15', '2026-08-31']);
  });

  it('liefert eine leere Liste, wenn nichts im Bereich liegt', async () => {
    await addDayProjectPlan('2026-01-01', '2026-001');
    expect(await listDayProjectPlansInRange('2026-08-01', '2026-08-31')).toEqual([]);
  });
});

describe('listAllDayProjectPlans', () => {
  it('liefert alle Planungen unabhängig vom Datum', async () => {
    await addDayProjectPlan('2026-01-01', '2026-001');
    await addDayProjectPlan('2027-12-31', '2027-050');
    expect(await listAllDayProjectPlans()).toHaveLength(2);
  });
});
