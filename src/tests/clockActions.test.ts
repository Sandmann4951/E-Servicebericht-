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
  listUnassignedIdleEntries,
  updateTimeEntry
} from '../lib/db/timeEntries';
import { checkInWorkDay, checkOutWorkDay, getActiveWorkDay } from '../lib/db/workDays';
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

  it('kumuliert über mehrere Aus-/Wiedereinstempel-Zyklen am selben Kalendertag, statt bei 0 neu anzufangen', async () => {
    // Erster Zyklus: einstempeln, 30 Min Leerlaufzeit, wieder ausstempeln.
    await checkInDay();
    let entry = await getGloballyActiveTimeEntry();
    await updateTimeEntry(entry!.id, { startTime: '08:00', endTime: '08:30' });
    const firstSummary = await checkOutDay();
    expect(firstSummary?.totalMinutes).toBe(30);

    // Zweiter Zyklus, selber Tag: erneut einstempeln (neuer WorkDay-Datensatz,
    // aber gleiches Datum) und weitere 45 Min Leerlaufzeit.
    await checkInDay();
    entry = await getGloballyActiveTimeEntry();
    await updateTimeEntry(entry!.id, { startTime: '09:00', endTime: '09:45' });
    const secondSummary = await checkOutDay();

    // Die Tagesbilanz muss beide Zyklen zusammenzählen (30 + 45 = 75), nicht
    // nur den zweiten Zyklus isoliert (was auf 45 zurückfallen würde).
    expect(secondSummary?.totalMinutes).toBe(75);
    expect(secondSummary?.idleMinutes).toBe(75);
    expect(secondSummary?.workDay.id).not.toBe(firstSummary?.workDay.id);
  });

  it('zählt nur Einträge des jeweiligen Kalendertages, nicht anderer Tage', async () => {
    const yesterday = await checkInWorkDay();
    await addTimeEntry(undefined, {
      date: '2020-01-01',
      startTime: '08:00',
      endTime: '09:00',
      workDayId: yesterday.id
    });
    await checkOutWorkDay(yesterday.id);

    await checkInDay();
    const entry = await getGloballyActiveTimeEntry();
    await updateTimeEntry(entry!.id, { startTime: '08:00', endTime: '08:20' });

    const summary = await checkOutDay();

    expect(summary?.totalMinutes).toBe(20);
  });
});

describe('checkOutDay mit Pausen', () => {
  it('schneidet eine Pause aus einem Projekt-Eintrag heraus (Split) und zählt sie separat statt als Projektzeit', async () => {
    const report = await createReport({ projectNumber: 'A' });
    const day = await checkInWorkDay();
    await addTimeEntry(report.id, { date: todayISODate(), startTime: '08:00', endTime: '16:00', workDayId: day.id }); // 480 Min.

    const summary = await checkOutDay([{ startTime: '12:00', endTime: '12:30' }]);

    expect(summary?.breakMinutes).toBe(30);
    expect(summary?.projectMinutes).toBe(450);
    expect(summary?.totalMinutes).toBe(450);

    const updatedReport = await getReport(report.id);
    expect(updatedReport?.totalDurationMinutes).toBe(450);

    // Ursprünglicher Eintrag wurde gesplittet: 08:00-12:00 und 12:30-16:00.
    const entries = await listTimeEntries(report.id);
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => [e.startTime, e.endTime]).sort()).toEqual([
      ['08:00', '12:00'],
      ['12:30', '16:00']
    ]);
  });

  it('summiert mehrere Pausen an einem Tag', async () => {
    const day = await checkInWorkDay();
    await addTimeEntry(undefined, { date: todayISODate(), startTime: '08:00', endTime: '16:00', workDayId: day.id });

    const summary = await checkOutDay([
      { startTime: '10:00', endTime: '10:15' },
      { startTime: '12:00', endTime: '12:30' }
    ]);

    expect(summary?.breakMinutes).toBe(45);
    expect(summary?.idleMinutes).toBe(480 - 45);
    expect(summary?.totalMinutes).toBe(480 - 45);
  });

  it('ignoriert unvollständige Pausen-Zeilen (fehlende Start- oder Endzeit)', async () => {
    const day = await checkInWorkDay();
    await addTimeEntry(undefined, { date: todayISODate(), startTime: '08:00', endTime: '16:00', workDayId: day.id });

    const summary = await checkOutDay([{ startTime: '12:00', endTime: '' }]);

    expect(summary?.breakMinutes).toBe(0);
    expect(summary?.totalMinutes).toBe(480);
  });

  it('legt für jede Pause einen eigenen isBreak-Eintrag an, der nicht als Leerlaufzeit zur Zuordnung auftaucht', async () => {
    const report = await createReport({ projectNumber: 'A' });
    const day = await checkInWorkDay();
    await addTimeEntry(report.id, { date: todayISODate(), startTime: '08:00', endTime: '16:00', workDayId: day.id });

    await checkOutDay([{ startTime: '12:00', endTime: '12:30' }]);

    const all = await listTimeEntriesForWorkDay(day.id);
    const breakEntry = all.find((e) => e.isBreak);
    expect(breakEntry).toBeTruthy();
    expect(breakEntry?.startTime).toBe('12:00');
    expect(breakEntry?.endTime).toBe('12:30');
    expect(breakEntry?.durationMinutes).toBe(30);
    expect(breakEntry?.reportId).toBeUndefined();

    // Der Pause-Eintrag selbst hat zwar keine reportId (wie Leerlaufzeit),
    // taucht aber trotzdem NICHT in der Zuordnungs-Liste auf.
    const unassigned = await listUnassignedIdleEntries();
    expect(unassigned.find((e) => e.id === breakEntry?.id)).toBeUndefined();
  });

  it('ohne Pausen-Angabe ändert sich am bisherigen Verhalten nichts (breakMinutes 0)', async () => {
    const day = await checkInWorkDay();
    await addTimeEntry(undefined, { date: todayISODate(), startTime: '08:00', endTime: '08:30', workDayId: day.id });

    const summary = await checkOutDay();

    expect(summary?.breakMinutes).toBe(0);
    expect(summary?.totalMinutes).toBe(30);
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
