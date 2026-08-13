import { beforeEach, describe, expect, it } from 'vitest';
import { openDB } from 'idb';
import { resetTestDB } from '../testUtils';
import { DB_NAME } from '../../lib/db/types';
import { getDB } from '../../lib/db/client';
import { getReport } from '../../lib/db/reports';
import { listTimeEntries } from '../../lib/db/timeEntries';

beforeEach(async () => {
  await resetTestDB();
});

describe('v2 -> v3 Migration: Zeitspannen über Mitternacht nachrechnen', () => {
  it('korrigiert einen bereits gespeicherten Eintrag, dessen Dauer unter der alten Ende-vor-Start-Logik verworfen wurde, und die betroffene Report-Summe', async () => {
    const reportId = 'r1';
    const entryId = 'e1';
    const now = new Date().toISOString();

    // Simuliert eine bestehende v2-Datenbank (vor diesem Bugfix): ein
    // Eintrag mit Start 19:05 und Ende 12:16 (nächster Tag), dessen
    // durationMinutes unter der alten Logik (Ende vor Start -> undefined)
    // gespeichert wurde, sowie eine dadurch zu niedrige Report-Summe.
    const setupDb = await openDB(DB_NAME, 2, {
      upgrade(db) {
        const reports = db.createObjectStore('reports', { keyPath: 'id' });
        reports.createIndex('projectNumber', 'projectNumber');
        reports.createIndex('status', 'status');
        reports.createIndex('updatedAt', 'updatedAt');

        const timeEntries = db.createObjectStore('timeEntries', { keyPath: 'id' });
        timeEntries.createIndex('reportId', 'reportId');
        timeEntries.createIndex('date', 'date');
        timeEntries.createIndex('workDayId', 'workDayId');

        db.createObjectStore('materialItems', { keyPath: 'id' }).createIndex('reportId', 'reportId');
        db.createObjectStore('photos', { keyPath: 'id' }).createIndex('reportId', 'reportId');

        const workDays = db.createObjectStore('workDays', { keyPath: 'id' });
        workDays.createIndex('date', 'date');
      }
    });

    await setupDb.put('reports', {
      id: reportId,
      projectNumber: 'MITTERNACHT',
      status: 'open',
      timeEntryCount: 1,
      totalDurationMinutes: 0, // alte, falsche Summe (Eintrag zählte als 0)
      materialItemCount: 0,
      photoCount: 0,
      createdAt: now,
      updatedAt: now
    });
    await setupDb.put('timeEntries', {
      id: entryId,
      reportId,
      date: '2026-08-12',
      startTime: '19:05',
      endTime: '12:16',
      durationMinutes: undefined, // alte Logik: Ende vor Start -> undefined
      createdAt: now,
      updatedAt: now
    });
    setupDb.close();

    // Die App öffnet die DB regulär - das triggert die v2->v3-Migration.
    await getDB();

    const [entry] = await listTimeEntries(reportId);
    expect(entry?.durationMinutes).toBe(17 * 60 + 11);

    const report = await getReport(reportId);
    expect(report?.totalDurationMinutes).toBe(17 * 60 + 11);
  });

  it('lässt bereits korrekte Einträge unverändert', async () => {
    const reportId = 'r2';
    const entryId = 'e2';
    const now = new Date().toISOString();

    const setupDb = await openDB(DB_NAME, 2, {
      upgrade(db) {
        const reports = db.createObjectStore('reports', { keyPath: 'id' });
        reports.createIndex('projectNumber', 'projectNumber');
        reports.createIndex('status', 'status');
        reports.createIndex('updatedAt', 'updatedAt');

        const timeEntries = db.createObjectStore('timeEntries', { keyPath: 'id' });
        timeEntries.createIndex('reportId', 'reportId');
        timeEntries.createIndex('date', 'date');
        timeEntries.createIndex('workDayId', 'workDayId');

        db.createObjectStore('materialItems', { keyPath: 'id' }).createIndex('reportId', 'reportId');
        db.createObjectStore('photos', { keyPath: 'id' }).createIndex('reportId', 'reportId');

        const workDays = db.createObjectStore('workDays', { keyPath: 'id' });
        workDays.createIndex('date', 'date');
      }
    });

    await setupDb.put('reports', {
      id: reportId,
      projectNumber: 'NORMAL',
      status: 'open',
      timeEntryCount: 1,
      totalDurationMinutes: 270,
      materialItemCount: 0,
      photoCount: 0,
      createdAt: now,
      updatedAt: now
    });
    await setupDb.put('timeEntries', {
      id: entryId,
      reportId,
      date: '2026-08-12',
      startTime: '08:00',
      endTime: '12:30',
      durationMinutes: 270,
      createdAt: now,
      updatedAt: now
    });
    setupDb.close();

    await getDB();

    const [entry] = await listTimeEntries(reportId);
    expect(entry?.durationMinutes).toBe(270);
    const report = await getReport(reportId);
    expect(report?.totalDurationMinutes).toBe(270);
  });
});
