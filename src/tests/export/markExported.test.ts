import { beforeEach, describe, expect, it } from 'vitest';
import { resetTestDB } from '../testUtils';
import { createReport, getReport } from '../../lib/db/reports';
import { addTimeEntry } from '../../lib/db/timeEntries';
import { addPhoto, listPhotos } from '../../lib/db/photos';
import { syncPerformedWorkFromNotes } from '../../lib/db/performedWorkSync';
import { getFullReport } from '../../lib/export/getFullReport';
import { filterToUnreportedOnly } from '../../lib/export/exportScope';
import { markExportedContent } from '../../lib/export/markExported';

beforeEach(async () => {
  await resetTestDB();
});

const blob = (): Blob => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
const photoInput = (takenAt: string) => ({
  blob: blob(),
  thumbnailBlob: blob(),
  mimeType: 'image/jpeg',
  sizeBytes: 3,
  takenAt
});

describe('Zwei Einsätze auf einem Bericht, dazwischen exportiert', () => {
  it('exportiert beim zweiten Mal mit "Nur Neues" nur die Arbeiten und Fotos des zweiten Einsatzes', async () => {
    const report = await createReport({ projectNumber: 'P-1' });
    await addTimeEntry(report.id, { date: '2026-08-10', startTime: '08:00', endTime: '12:00', note: 'Zählerschrank gesetzt' });
    await addPhoto(report.id, photoInput('2026-08-10T09:00:00.000Z'));
    await addPhoto(report.id, photoInput('2026-08-10T10:00:00.000Z'));
    await syncPerformedWorkFromNotes(report.id);

    const first = (await getFullReport(report.id))!;
    await markExportedContent(report.id, first, first);
    expect((await listPhotos(report.id)).every((photo) => photo.reportedAt)).toBe(true);
    expect((await getReport(report.id))?.reportedPerformedWork).toBe('10.08.2026, 08:00–12:00: Zählerschrank gesetzt');

    await addTimeEntry(report.id, { date: '2026-08-20', startTime: '08:00', endTime: '11:00', note: 'Wallbox angeschlossen' });
    await addPhoto(report.id, photoInput('2026-08-20T09:00:00.000Z'));
    const second = filterToUnreportedOnly((await getFullReport(report.id))!);

    expect(second.report.performedWork).toBe('20.08.2026, 08:00–11:00: Wallbox angeschlossen');
    expect(second.photos.map((photo) => photo.takenAt)).toEqual(['2026-08-20T09:00:00.000Z']);
    expect(second.timeEntries.map((entry) => entry.date)).toEqual(['2026-08-20']);
  });
});
