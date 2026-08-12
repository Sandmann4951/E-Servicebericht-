import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTestDB } from './testUtils';
import { clockInToReport } from '../lib/clockActions';
import { createReport } from '../lib/db/reports';
import { getActiveTimeEntry, getGloballyActiveTimeEntry, listTimeEntries } from '../lib/db/timeEntries';

beforeEach(async () => {
  await resetTestDB();
});

describe('clockInToReport', () => {
  it('stempelt ohne Rückfrage ein, wenn nirgends sonst eine Session läuft', async () => {
    const report = await createReport({ projectNumber: 'A' });

    const result = await clockInToReport(report.id);

    expect(result).toBe(true);
    const active = await getActiveTimeEntry(report.id);
    expect(active?.startTime).toBeTruthy();
  });

  it('beendet nach Bestätigung eine anderswo laufende Session und stempelt hier neu ein', async () => {
    const other = await createReport({ projectNumber: 'OTHER' });
    await clockInToReport(other.id);

    const target = await createReport({ projectNumber: 'TARGET' });
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmSpy);

    const result = await clockInToReport(target.id);

    expect(confirmSpy).toHaveBeenCalled();
    expect(result).toBe(true);
    // getActiveTimeEntry() liefert nur NOCH laufende Einträge - der alte ist
    // jetzt beendet (hat eine endTime) und taucht dort nicht mehr auf, muss
    // also über listTimeEntries() geprüft werden.
    const [otherEntry] = await listTimeEntries(other.id);
    expect(otherEntry?.endTime).toBeTruthy();
    expect((await getActiveTimeEntry(target.id))?.startTime).toBeTruthy();

    vi.unstubAllGlobals();
  });

  it('stempelt nicht ein, wenn die Rückfrage abgelehnt wird', async () => {
    const other = await createReport({ projectNumber: 'OTHER' });
    await clockInToReport(other.id);

    const target = await createReport({ projectNumber: 'TARGET' });
    vi.stubGlobal('confirm', vi.fn(() => false));

    const result = await clockInToReport(target.id);

    expect(result).toBe(false);
    expect(await getActiveTimeEntry(target.id)).toBeUndefined();
    // die andere Session läuft unverändert weiter
    expect((await getActiveTimeEntry(other.id))?.endTime).toBeUndefined();

    vi.unstubAllGlobals();
  });

  it('fragt nicht nach, wenn bereits im selben Bericht eingestempelt ist', async () => {
    const report = await createReport({ projectNumber: 'A' });
    await clockInToReport(report.id);
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmSpy);

    await clockInToReport(report.id);

    expect(confirmSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('lässt am Ende höchstens eine global aktive Session übrig', async () => {
    const other = await createReport({ projectNumber: 'OTHER' });
    await clockInToReport(other.id);
    const target = await createReport({ projectNumber: 'TARGET' });
    vi.stubGlobal('confirm', vi.fn(() => true));

    await clockInToReport(target.id);

    const globallyActive = await getGloballyActiveTimeEntry();
    expect(globallyActive?.reportId).toBe(target.id);
    vi.unstubAllGlobals();
  });
});
