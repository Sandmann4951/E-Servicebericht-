import { beforeEach, describe, expect, it } from 'vitest';
import { resetTestDB } from '../testUtils';
import { createReport, deleteReport } from '../../lib/db/reports';
import { addTimeEntry, listTimeEntries } from '../../lib/db/timeEntries';
import { addMaterialItem, listMaterialItems } from '../../lib/db/materialItems';
import { addPhoto, listPhotos } from '../../lib/db/photos';

beforeEach(async () => {
  await resetTestDB();
});

describe('Cascade Delete', () => {
  it('löscht beim Entfernen eines Reports alle zugehörigen Zeiten/Material/Fotos', async () => {
    const report = await createReport({ projectNumber: '1' });
    await addTimeEntry(report.id, { date: '2026-08-10', startTime: '08:00', endTime: '10:00' });
    await addMaterialItem(report.id, { description: 'Kabel NYM-J 3x1,5', quantity: 20, unit: 'm' });
    await addPhoto(report.id, {
      blob: new Blob(['fake-image']),
      thumbnailBlob: new Blob(['fake-thumb']),
      mimeType: 'image/jpeg',
      sizeBytes: 10
    });

    await deleteReport(report.id);

    expect(await listTimeEntries(report.id)).toHaveLength(0);
    expect(await listMaterialItems(report.id)).toHaveLength(0);
    expect(await listPhotos(report.id)).toHaveLength(0);
  });

  it('lässt Daten anderer Reports beim Löschen unangetastet', async () => {
    const reportA = await createReport({ projectNumber: 'A' });
    const reportB = await createReport({ projectNumber: 'B' });
    await addMaterialItem(reportA.id, { description: 'Steckdose', quantity: 1, unit: 'Stk' });
    await addMaterialItem(reportB.id, { description: 'Schalter', quantity: 1, unit: 'Stk' });

    await deleteReport(reportA.id);

    expect(await listMaterialItems(reportA.id)).toHaveLength(0);
    expect(await listMaterialItems(reportB.id)).toHaveLength(1);
  });
});
