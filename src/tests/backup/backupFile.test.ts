import { beforeEach, describe, expect, it } from 'vitest';
import { resetTestDB } from '../testUtils';
import { createReport } from '../../lib/db/reports';
import { addTimeEntry } from '../../lib/db/timeEntries';
import { addMaterialItem } from '../../lib/db/materialItems';
import { addPhoto } from '../../lib/db/photos';
import { checkInWorkDay, checkOutWorkDay } from '../../lib/db/workDays';
import { setAbsence } from '../../lib/db/absences';
import { addDayProjectPlan } from '../../lib/db/dayProjectPlans';
import { getAllData } from '../../lib/db/backup';
import { buildBackupFile, parseBackupFile, restoreBackup, suggestedBackupFileName } from '../../lib/backup/backupFile';

beforeEach(async () => {
  await resetTestDB();
});

describe('buildBackupFile / parseBackupFile', () => {
  it('exportiert und importiert einen vollständigen Datenbestand verlustfrei (inkl. Fotos)', async () => {
    const report = await createReport({ projectNumber: '2026-001', projectDescription: 'Test' });
    await addTimeEntry(report.id, { date: '2026-08-11', startTime: '08:00', endTime: '12:00' });
    await addMaterialItem(report.id, { description: 'Kabel NYM-J 3x1,5', quantity: 20, unit: 'm' });
    const photoBytes = new Uint8Array([1, 2, 3, 4, 5, 250, 251, 252, 253, 254, 255]);
    await addPhoto(report.id, {
      blob: new Blob([photoBytes], { type: 'image/jpeg' }),
      thumbnailBlob: new Blob([photoBytes.slice(0, 3)], { type: 'image/jpeg' }),
      mimeType: 'image/jpeg',
      width: 100,
      height: 80,
      sizeBytes: photoBytes.length
    });

    const blob = await buildBackupFile();
    expect(blob.type).toBe('application/json');

    const file = new File([blob], 'backup.json', { type: 'application/json' });
    const { data, summary } = await parseBackupFile(file);

    expect(summary).toEqual({
      reportCount: 1,
      timeEntryCount: 1,
      materialItemCount: 1,
      photoCount: 1,
      workDayCount: 0,
      absenceCount: 0,
      dayProjectPlanCount: 0
    });
    expect(data.reports[0].projectNumber).toBe('2026-001');
    expect(data.reports[0].projectDescription).toBe('Test');

    const restoredBytes = new Uint8Array(await data.photos[0].blob.arrayBuffer());
    expect(Array.from(restoredBytes)).toEqual(Array.from(photoBytes));
  });

  it('stellt einen Datenbestand nach Löschen aller Daten wieder her', async () => {
    const report = await createReport({ projectNumber: 'RESTORE-ME' });
    await addTimeEntry(report.id, { date: '2026-08-11', startTime: '08:00', endTime: '10:00' });

    const blob = await buildBackupFile();
    const file = new File([blob], 'backup.json', { type: 'application/json' });
    const { data } = await parseBackupFile(file);

    await resetTestDB(); // simuliert ein leeres/neues Gerät
    expect((await getAllData()).reports).toHaveLength(0);

    await restoreBackup(data);

    const restored = await getAllData();
    expect(restored.reports).toHaveLength(1);
    expect(restored.reports[0].projectNumber).toBe('RESTORE-ME');
    expect(restored.timeEntries).toHaveLength(1);
  });

  it('überschreibt vorhandene Datensätze mit gleicher ID beim erneuten Import (Upsert)', async () => {
    const report = await createReport({ projectNumber: 'V1' });
    const blobV1 = await buildBackupFile();

    // Bericht lokal ändern (simuliert eine ältere Sicherung, die man erneut einspielt)
    const { updateReport } = await import('../../lib/db/reports');
    await updateReport(report.id, { projectNumber: 'V2-lokal-geändert' });

    const { data } = await parseBackupFile(new File([blobV1], 'b.json', { type: 'application/json' }));
    await restoreBackup(data);

    const all = await getAllData();
    expect(all.reports).toHaveLength(1);
    expect(all.reports[0].projectNumber).toBe('V1');
  });

  it('sichert und stellt den workDays-Store (Tagesstempeluhr) im Rundlauf mit wieder her', async () => {
    const day = await checkInWorkDay();
    await checkOutWorkDay(day.id);

    const blob = await buildBackupFile();
    const file = new File([blob], 'backup.json', { type: 'application/json' });
    const { data, summary } = await parseBackupFile(file);

    expect(summary.workDayCount).toBe(1);
    expect(data.workDays).toHaveLength(1);
    expect(data.workDays[0].id).toBe(day.id);
    expect(data.workDays[0].checkOutTime).toBeTruthy();

    await resetTestDB();
    await restoreBackup(data);

    const restored = await getAllData();
    expect(restored.workDays).toHaveLength(1);
    expect(restored.workDays[0].id).toBe(day.id);
  });

  it('sichert und stellt Abwesenheiten (Urlaub/Krank/Zeitausgleich) im Rundlauf mit wieder her', async () => {
    await setAbsence('2026-08-10', 'vacation', 'Sommerurlaub');

    const blob = await buildBackupFile();
    const file = new File([blob], 'backup.json', { type: 'application/json' });
    const { data, summary } = await parseBackupFile(file);

    expect(summary.absenceCount).toBe(1);
    expect(data.absences).toHaveLength(1);
    expect(data.absences[0]).toMatchObject({ date: '2026-08-10', type: 'vacation', note: 'Sommerurlaub' });

    await resetTestDB();
    await restoreBackup(data);

    const restored = await getAllData();
    expect(restored.absences).toHaveLength(1);
    expect(restored.absences[0].date).toBe('2026-08-10');
  });

  it('sichert und stellt Tagesplanungen (geplante Projekte pro Kalendertag, auch mehrere am selben Tag) im Rundlauf mit wieder her', async () => {
    await addDayProjectPlan('2026-08-12', '2026-001');
    await addDayProjectPlan('2026-08-12', '2026-002');

    const blob = await buildBackupFile();
    const file = new File([blob], 'backup.json', { type: 'application/json' });
    const { data, summary } = await parseBackupFile(file);

    expect(summary.dayProjectPlanCount).toBe(2);
    expect(data.dayProjectPlans).toHaveLength(2);
    expect(data.dayProjectPlans.map((p) => p.projectNumber).sort()).toEqual(['2026-001', '2026-002']);
    expect(data.dayProjectPlans[0]).toMatchObject({ date: '2026-08-12' });
    expect(data.dayProjectPlans[0].id).toBeTruthy();

    await resetTestDB();
    await restoreBackup(data);

    const restored = await getAllData();
    expect(restored.dayProjectPlans).toHaveLength(2);
    expect(restored.dayProjectPlans.every((p) => p.date === '2026-08-12')).toBe(true);
  });

  it('liest eine v4-Sicherungsdatei mit dayProjectPlans OHNE eigene id weiterhin ein (eine id wird nachträglich vergeben)', async () => {
    const report = await createReport({ projectNumber: 'ALT-V4' });

    // Simuliert eine v4-Sicherung (vor Einführung mehrerer Projekte pro Tag):
    // dayProjectPlans-Einträge ohne "id"-Feld, das Datum war damals der Schlüssel.
    const v4Backup = {
      format: 'e-servicebericht-backup-v4',
      exportedAt: new Date().toISOString(),
      reports: (await getAllData()).reports,
      timeEntries: [],
      materialItems: [],
      photos: [],
      workDays: [],
      absences: [],
      dayProjectPlans: [
        { date: '2026-08-12', projectNumber: 'ALT-V4', createdAt: '2026-08-10T08:00:00.000Z', updatedAt: '2026-08-10T08:00:00.000Z' }
      ]
    };
    const file = new File([JSON.stringify(v4Backup)], 'v4.json', { type: 'application/json' });

    const { data, summary } = await parseBackupFile(file);

    expect(summary.dayProjectPlanCount).toBe(1);
    expect(data.dayProjectPlans[0].id).toBeTruthy();
    expect(data.dayProjectPlans[0]).toMatchObject({ date: '2026-08-12', projectNumber: 'ALT-V4' });
    expect(data.reports).toHaveLength(1);
    expect(data.reports[0].projectNumber).toBe(report.projectNumber);

    // Muss sich auch ohne Fehler in die DB schreiben lassen (neuer Store hat keyPath 'id').
    await resetTestDB();
    await restoreBackup(data);
    const restored = await getAllData();
    expect(restored.dayProjectPlans).toHaveLength(1);
  });

  it('liest eine v3-Sicherungsdatei ohne dayProjectPlans-Feld weiterhin klaglos ein (dayProjectPlans bleibt leer)', async () => {
    const report = await createReport({ projectNumber: 'ALT-V3' });

    // Simuliert eine v3-Sicherung (vor Einführung der Tagesplanung): kein "dayProjectPlans"-Feld im JSON.
    const v3Backup = {
      format: 'e-servicebericht-backup-v3',
      exportedAt: new Date().toISOString(),
      reports: (await getAllData()).reports,
      timeEntries: [],
      materialItems: [],
      photos: [],
      workDays: [],
      absences: []
    };
    const file = new File([JSON.stringify(v3Backup)], 'v3.json', { type: 'application/json' });

    const { data, summary } = await parseBackupFile(file);

    expect(summary.dayProjectPlanCount).toBe(0);
    expect(data.dayProjectPlans).toEqual([]);
    expect(data.reports).toHaveLength(1);
    expect(data.reports[0].projectNumber).toBe(report.projectNumber);
  });

  it('liest eine v2-Sicherungsdatei ohne absences-Feld weiterhin klaglos ein (absences bleibt leer)', async () => {
    const report = await createReport({ projectNumber: 'ALT-V2' });

    // Simuliert eine v2-Sicherung (vor Einführung der Abwesenheiten): kein "absences"-Feld im JSON.
    const v2Backup = {
      format: 'e-servicebericht-backup-v2',
      exportedAt: new Date().toISOString(),
      reports: (await getAllData()).reports,
      timeEntries: [],
      materialItems: [],
      photos: [],
      workDays: []
    };
    const file = new File([JSON.stringify(v2Backup)], 'v2.json', { type: 'application/json' });

    const { data, summary } = await parseBackupFile(file);

    expect(summary.absenceCount).toBe(0);
    expect(data.absences).toEqual([]);
    expect(data.reports).toHaveLength(1);
    expect(data.reports[0].projectNumber).toBe(report.projectNumber);
  });

  it('liest eine v1-Sicherungsdatei ohne workDays-Feld weiterhin klaglos ein (workDays bleibt leer)', async () => {
    const report = await createReport({ projectNumber: 'ALT' });
    await addTimeEntry(report.id, { date: '2026-08-11', startTime: '08:00', endTime: '09:00' });

    // Simuliert eine ältere v1-Sicherung: kein "workDays"-Feld im JSON.
    const v1Backup = {
      format: 'e-servicebericht-backup-v1',
      exportedAt: new Date().toISOString(),
      reports: (await getAllData()).reports,
      timeEntries: (await getAllData()).timeEntries,
      materialItems: [],
      photos: []
    };
    const file = new File([JSON.stringify(v1Backup)], 'v1.json', { type: 'application/json' });

    const { data, summary } = await parseBackupFile(file);

    expect(summary.workDayCount).toBe(0);
    expect(data.workDays).toEqual([]);
    expect(data.reports).toHaveLength(1);
  });

  it('lehnt eine ungültige Datei ab', async () => {
    const file = new File([JSON.stringify({ foo: 'bar' })], 'invalid.json', { type: 'application/json' });
    await expect(parseBackupFile(file)).rejects.toThrow();
  });

  it('lehnt kein-JSON ab', async () => {
    const file = new File(['nicht json'], 'invalid.json', { type: 'application/json' });
    await expect(parseBackupFile(file)).rejects.toThrow();
  });
});

describe('suggestedBackupFileName', () => {
  it('liefert einen Dateinamen mit heutigem Datum', () => {
    const name = suggestedBackupFileName();
    expect(name).toMatch(/^Rivo-Backup-\d{4}-\d{2}-\d{2}\.json$/);
  });
});
