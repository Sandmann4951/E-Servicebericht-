import { getReport, listBreaksForDates, listTimeEntries, listMaterialItems, listPhotos } from '../db';
import type { ServiceReport, TimeEntry, MaterialItem, Photo, ID } from '../db/types';

export interface FullReport {
  report: ServiceReport;
  timeEntries: TimeEntry[];
  /** Pausen an den Tagen dieses Berichts (Pausen haben keine reportId) - für die Pause-Spalte der Zeiten-Tabelle. */
  breaks?: TimeEntry[];
  materialItems: MaterialItem[];
  photos: Photo[];
}

/** Lädt einen Bericht mitsamt allen Zeiten/Material/Fotos für den Export. */
export async function getFullReport(id: ID): Promise<FullReport | undefined> {
  const report = await getReport(id);
  if (!report) return undefined;

  const [timeEntries, materialItems, photos] = await Promise.all([
    listTimeEntries(id),
    listMaterialItems(id),
    listPhotos(id)
  ]);

  const breaks = await listBreaksForDates(timeEntries.map((entry) => entry.date));

  return { report, timeEntries, breaks, materialItems, photos };
}
