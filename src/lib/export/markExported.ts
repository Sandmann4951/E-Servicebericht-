import { markMaterialItemsReported } from '../db/materialItems';
import { markPhotosReported } from '../db/photos';
import { markReportExported } from '../db/reports';
import { markTimeEntriesReported } from '../db/timeEntries';
import type { FullReport } from './getFullReport';

/**
 * Markiert nach einem erfolgreichen Export genau das als berichtet, was in
 * `exported` enthalten war (bei "Nur Neues" also nur der vorher offene Teil,
 * siehe exportScope.ts). "Durchgeführte Arbeiten" gilt danach im
 * VOLLSTÄNDIGEN aktuellen Stand (`full`) als berichtet - die Zeilen davor
 * waren ja schon im letzten Export.
 */
export async function markExportedContent(reportId: string, exported: FullReport, full: FullReport): Promise<void> {
  await markTimeEntriesReported(exported.timeEntries.map((entry) => entry.id));
  await markMaterialItemsReported(exported.materialItems.map((item) => item.id));
  await markPhotosReported(exported.photos.filter((photo) => !photo.excludeFromReport).map((photo) => photo.id));
  await markReportExported(reportId, full.report.performedWork ?? '');
}
