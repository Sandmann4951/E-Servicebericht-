import { beforeEach, describe, expect, it } from 'vitest';
import { resetTestDB } from '../testUtils';
import { createReport } from '../../lib/db/reports';
import { addTimeEntry } from '../../lib/db/timeEntries';
import { addMaterialItem } from '../../lib/db/materialItems';
import { addPhoto } from '../../lib/db/photos';
import { checkInWorkDay, checkOutWorkDay } from '../../lib/db/workDays';
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
      workDayCount: 0
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
