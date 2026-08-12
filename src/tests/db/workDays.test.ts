import { beforeEach, describe, expect, it } from 'vitest';
import { resetTestDB } from '../testUtils';
import { checkInWorkDay, checkOutWorkDay, getActiveWorkDay, getWorkDay } from '../../lib/db/workDays';

beforeEach(async () => {
  await resetTestDB();
});

describe('checkInWorkDay / getActiveWorkDay / checkOutWorkDay', () => {
  it('legt einen neuen Tagesstempel mit checkInTime, ohne checkOutTime an', async () => {
    const day = await checkInWorkDay();

    expect(day.checkInTime).toBeTruthy();
    expect(day.checkOutTime).toBeUndefined();
    expect(day.date).toBeTruthy();
  });

  it('liefert undefined, wenn kein Tag aktiv ist', async () => {
    expect(await getActiveWorkDay()).toBeUndefined();
  });

  it('findet den aktiven Tagesstempel nach dem Einstempeln', async () => {
    const day = await checkInWorkDay();

    const active = await getActiveWorkDay();

    expect(active?.id).toBe(day.id);
  });

  it('ist nach dem Auschecken nicht mehr aktiv', async () => {
    const day = await checkInWorkDay();

    const closed = await checkOutWorkDay(day.id);

    expect(closed?.checkOutTime).toBeTruthy();
    expect(await getActiveWorkDay()).toBeUndefined();
  });

  it('liefert undefined beim Auschecken einer unbekannten id', async () => {
    expect(await checkOutWorkDay('unbekannt')).toBeUndefined();
  });

  it('getWorkDay liefert den Tagesstempel per id', async () => {
    const day = await checkInWorkDay();

    expect((await getWorkDay(day.id))?.id).toBe(day.id);
    expect(await getWorkDay('unbekannt')).toBeUndefined();
  });
});
