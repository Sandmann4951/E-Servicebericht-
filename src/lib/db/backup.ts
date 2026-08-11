import { getDB } from './client';
import type { MaterialItem, Photo, ServiceReport, TimeEntry } from './types';

export interface AllData {
  reports: ServiceReport[];
  timeEntries: TimeEntry[];
  materialItems: MaterialItem[];
  photos: Photo[];
}

/** Liest den kompletten Datenbestand (alle Berichte + Zeiten/Material/Fotos) für eine Sicherung. */
export async function getAllData(): Promise<AllData> {
  const db = await getDB();
  const [reports, timeEntries, materialItems, photos] = await Promise.all([
    db.getAll('reports'),
    db.getAll('timeEntries'),
    db.getAll('materialItems'),
    db.getAll('photos')
  ]);
  return { reports, timeEntries, materialItems, photos };
}

/**
 * Schreibt einen kompletten Datenbestand zurück (z.B. aus einer Sicherung) -
 * per put() je Datensatz, also ein Upsert: vorhandene IDs werden überschrieben,
 * neue IDs werden ergänzt. Läuft in einer Transaktion über alle vier Stores.
 */
export async function restoreAllData(data: AllData): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['reports', 'timeEntries', 'materialItems', 'photos'], 'readwrite');

  await Promise.all([
    ...data.reports.map((report) => tx.objectStore('reports').put(report)),
    ...data.timeEntries.map((entry) => tx.objectStore('timeEntries').put(entry)),
    ...data.materialItems.map((item) => tx.objectStore('materialItems').put(item)),
    ...data.photos.map((photo) => tx.objectStore('photos').put(photo))
  ]);

  await tx.done;
}
