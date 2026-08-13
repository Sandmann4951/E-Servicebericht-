import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTestDB } from './testUtils';
import {
  checkInDay,
  checkOutDay,
  reassignIdleEntry,
  startProjectByNumber,
  switchToIdle,
  switchToProject
} from '../lib/clockActions';
import { createReport, finalizeReport, getReport, listReports } from '../lib/db/reports';
import {
  addTimeEntry,
  getGloballyActiveTimeEntry,
  listTimeEntries,
  listTimeEntriesForWorkDay,
  listUnassignedIdleEntries
} from '../lib/db/timeEntries';
import { checkInWorkDay, getActiveWorkDay } from '../lib/db/workDays';
import { todayISODate } from '../lib/utils/date';

beforeEach(async () => {
  await resetTestDB();
});

describe('checkInDay', () => {
  it('startet den Tag und öffnet sofort einen Leerlaufzeit-Eintrag', async () => {
    const day = await checkInDay();

    expect(day.checkInTime).toBeTruthy();
    expect(day.checkOutTime).toBeUndefined();
    const active = await getGloballyActiveTimeEntry();
    expect(active?.workDayId).toBe(day.id);
    expect(active?.reportId).toBeUndefined();
  });

  it('ist idempotent, wenn bereits ein Tag läuft', async () => {
    const day1 = await checkInDay();
    const day2 = await checkInDay();

    expect(day2.id).toBe(day1.id);
    const entries = await listTimeEntriesForWorkDay(day1.id);
    expect(entries).toHaveLength(1);
  });
});

describe('switchToProject', () => {
  it('startet transparent den Tag, wenn noch keiner läuft ("Direkt einchecken")', async () => {
    const report = await createReport({ projectNumber: 'A' });

    const result = await switchToProject(report.id);

    expect(result).toBe(true);
    const day = await getActiveWorkDay();
    expect(day).toBeTruthy();
    const active = await getGloballyActiveTimeEntry();
    expect(active?.reportId).toBe(report.id);
    expect(active?.workDayId).toBe(day?.id);
  });

  it('verweigert den Wechsel in einen gesperrten Bericht', async () => {
    const report = await createReport({ projectNumber: 'A' });
    await finalizeReport(report.id);

    const result = await switchToProject(report.id);

    expect(result).toBe(false);
    expect(await getActiveWorkDay()).toBeUndefined();
  });

  it('fragt beim Wechsel von Leerlaufzeit in ein Projekt nicht nach', async () => {
    await checkInDay();
    const report = await createReport({ projectNumber: 'A' });
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmSpy);

    const result = await switchToProject(report.id);

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(result).toBe(true);
    vi.unstubAllGlobals();
  });

  it('fragt beim Wechsel zwischen zwei verschiedenen Projekten nach und wechselt bei Bestätigung', async () => {
    const reportA = await createReport({ projectNumber: 'A' });
    const reportB = await createReport({ projectNumber: 'B' });
    await switchToProject(reportA.id);
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmSpy);

    const result = await switchToProject(reportB.id);

    expect(confirmSpy).toHaveBeenCalled();
    expect(result).toBe(true);
    const active = await getGloballyActiveTimeEntry();
    expect(active?.reportId).toBe(reportB.id);
    vi.unstubAllGlobals();
  });

  it('bricht bei Ablehnung der Rückfrage ab und bleibt im alten Projekt', async () => {
    const reportA = await createReport({ projectNumber: 'A' });
    const reportB = await createReport({ projectNumber: 'B' });
    await switchToProject(reportA.id);
    vi.stubGlobal('confirm', vi.fn(() => false));

    const result = await switchToProject(reportB.id);

    expect(result).toBe(false);
    const active = await getGloballyActiveTimeEntry();
    expect(active?.reportId).toBe(reportA.id);
    vi.unstubAllGlobals();
  });

  it('fragt nicht nach, wenn bereits im selben Bericht eingecheckt ist', async () => {
    const report = await createReport({ projectNumber: 'A' });
    await switchToProject(report.id);
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmSpy);

    await switchToProject(report.id);

    expect(confirmSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('switchToIdle', () => {
  it('hat keinen Effekt, wenn kein Tag läuft', async () => {
    await switchToIdle();

    expect(await getActiveWorkDay()).toBeUndefined();
  });

  it('schließt den Projekt-Eintrag und öffnet Leerlaufzeit', async () => {
    const report = await createReport({ projectNumber: 'A' });
    await switchToProject(report.id);
    const activeBefore = await getGloballyActiveTimeEntry();

    await switchToIdle();

    const activeAfter = await getGloballyActiveTimeEntry();
    expect(activeAfter?.reportId).toBeUndefined();
    expect(activeAfter?.id).not.toBe(activeBefore?.id);
    const [closed] = await listTimeEntries(report.id);
    expect(closed?.endTime).toBeTruthy();
  });
});

describe('checkOutDay', () => {
  it('liefert undefined ohne aktiven Tag', async () => {
    expect(await checkOutDay()).toBeUndefined();
  });

  it('schließt einen noch offenen Abschnitt beim Auschecken', async () => {
    const day = await checkInWorkDay();
    await addTimeEntry(undefined, { date: todayISODate(), startTime: '08:00', workDayId: day.id });

    const summary = await checkOutDay();

    expect(summary?.workDay.checkOutTime).toBeTruthy();
    const [entry] = await listTimeEntriesForWorkDay(day.id);
    expect(entry?.endTime).toBeTruthy();
  });

  it('berechnet Gesamt-/Projekt-/Leerlaufzeit korrekt bei gemischten Abschnitten', async () => {
    const report = await createReport({ projectNumber: 'A' });
    const day = await checkInWorkDay();
    await addTimeEntry(undefined, {
      date: todayISODate(),
      startTime: '08:00',
      endTime: '08:30',
      workDayId: day.id
    });
    await addTimeEntry(report.id, {
      date: todayISODate(),
      startTime: '08:30',
      endTime: '10:00',
      workDayId: day.id
    });
    await addTimeEntry(undefined, {
      date: todayISODate(),
      startTime: '10:00',
      endTime: '10:15',
      workDayId: day.id
    });

    const summary = await checkOutDay();

    expect(summary?.idleMinutes).toBe(45);
    expect(summary?.projectMinutes).toBe(90);
    expect(summary?.totalMinutes).toBe(135);
  });
});

describe('reassignIdleEntry', () => {
  it('ordnet einen Leerlaufzeit-Eintrag einem Bericht zu und aktualisiert dessen Summary', async () => {
    const report = await createReport({ projectNumber: 'A' });
    const day = await checkInWorkDay();
    const entry = await addTimeEntry(undefined, {
      date: todayISODate(),
      startTime: '08:00',
      endTime: '09:00',
      workDayId: day.id
    });

    await reassignIdleEntry(entry.id, report.id);

    const updated = await getReport(report.id);
    expect(updated?.timeEntryCount).toBe(1);
    expect(updated?.totalDurationMinutes).toBe(60);
    expect(await listUnassignedIdleEntries()).toEqual([]);
  });
});

describe('startProjectByNumber', () => {
  it('legt einen neuen Bericht an, wenn es diese Projektnummer noch nicht gibt', async () => {
    const result = await startProjectByNumber('555555');

    expect(result.reused).toBe(false);
    expect(result.visitNumber).toBe(1);
    expect(result.visitTotal).toBe(1);
    expect(result.report.projectNumber).toBe('555555');
  });

  it('verwendet einen bereits offenen Bericht mit derselben Projektnummer wieder, statt ein Duplikat anzulegen', async () => {
    const open = await createReport({ projectNumber: '555555' });

    const result = await startProjectByNumber('555555');

    expect(result.reused).toBe(true);
    expect(result.report.id).toBe(open.id);
    const all = await listReports('all');
    expect(all.filter((r) => r.projectNumber === '555555')).toHaveLength(1);
  });

  it('legt einen weiteren Bericht an (mit korrekter Besuchsnummer), wenn der bisherige Bericht zu dieser Projektnummer bereits gesperrt ist', async () => {
    const first = await createReport({ projectNumber: '555555' });
    await finalizeReport(first.id);

    const result = await startProjectByNumber('555555');

    expect(result.reused).toBe(false);
    expect(result.report.id).not.toBe(first.id);
    expect(result.visitNumber).toBe(2);
    expect(result.visitTotal).toBe(2);
  });

  it('trimmt die eingegebene Projektnummer', async () => {
    const result = await startProjectByNumber('  555555  ');

    expect(result.report.projectNumber).toBe('555555');
  });

  it('übernimmt den Techniker-Namen beim Neuanlegen', async () => {
    const result = await startProjectByNumber('555555', 'Daniel');

    expect(result.report.technicianName).toBe('Daniel');
  });
});
