import { beforeEach, describe, expect, it } from 'vitest';
import { resetTestDB } from '../testUtils';
import { createReport } from '../../lib/db/reports';
import { addTimeEntry } from '../../lib/db/timeEntries';
import { addMaterialItem } from '../../lib/db/materialItems';
import { addPhoto } from '../../lib/db/photos';
import { getFullReport } from '../../lib/export/getFullReport';

beforeEach(async () => {
  await resetTestDB();
});

describe('getFullReport', () => {
  it('liefert undefined für einen nicht existierenden Bericht', async () => {
    expect(await getFullReport('does-not-exist')).toBeUndefined();
  });

  it('aggregiert Bericht, Zeiten, Material und Fotos', async () => {
    const report = await createReport({ projectNumber: '2026-001' });
    await addTimeEntry(report.id, { date: '2026-08-10', startTime: '08:00', endTime: '10:00' });
    await addMaterialItem(report.id, { description: 'Kabel NYM-J 3x1,5', quantity: 20, unit: 'm' });
    await addPhoto(report.id, {
      blob: new Blob(['fake-image']),
      thumbnailBlob: new Blob(['fake-thumb']),
      mimeType: 'image/jpeg',
      sizeBytes: 10
    });

    const data = await getFullReport(report.id);

    expect(data).toBeDefined();
    expect(data?.report.id).toBe(report.id);
    expect(data?.timeEntries).toHaveLength(1);
    expect(data?.materialItems).toHaveLength(1);
    expect(data?.photos).toHaveLength(1);
  });

  it('liefert leere Listen für einen frisch angelegten Bericht ohne Zeiten/Material/Fotos', async () => {
    const report = await createReport({ projectNumber: 'LEER' });
    const data = await getFullReport(report.id);

    expect(data?.timeEntries).toEqual([]);
    expect(data?.materialItems).toEqual([]);
    expect(data?.photos).toEqual([]);
  });
});
