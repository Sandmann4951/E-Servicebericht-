import { getDB } from './client';
import type { Absence, MaterialItem, Photo, ServiceReport, TimeEntry, WorkDay } from './types';

export interface AllData {
  reports: ServiceReport[];
  timeEntries: TimeEntry[];
  materialItems: MaterialItem[];
  photos: Photo[];
  workDays: WorkDay[];
  absences: Absence[];
}

/** Liest den kompletten Datenbestand (alle Berichte + Zeiten/Material/Fotos/Tagesstempel/Abwesenheiten) für eine Sicherung. */
export async function getAllData(): Promise<AllData> {
  const db = await getDB();
  const [reports, timeEntries, materialItems, photos, workDays, absences] = await Promise.all([
    db.getAll('reports'),
    db.getAll('timeEntries'),
    db.getAll('materialItems'),
    db.getAll('photos'),
    db.getAll('workDays'),
    db.getAll('absences')
  ]);
  return { reports, timeEntries, materialItems, photos, workDays, absences };
}

/**
 * Schreibt einen kompletten Datenbestand zurück (z.B. aus einer Sicherung) -
 * per put() je Datensatz, also ein Upsert: vorhandene IDs werden überschrieben,
 * neue IDs werden ergänzt. Läuft in einer Transaktion über alle sechs Stores.
 */
export async function restoreAllData(data: AllData): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(
    ['reports', 'timeEntries', 'materialItems', 'photos', 'workDays', 'absences'],
    'readwrite'
  );

  await Promise.all([
    ...data.reports.map((report) => tx.objectStore('reports').put(report)),
    ...data.timeEntries.map((entry) => tx.objectStore('timeEntries').put(entry)),
    ...data.materialItems.map((item) => tx.objectStore('materialItems').put(item)),
    ...data.photos.map((photo) => tx.objectStore('photos').put(photo)),
    ...data.workDays.map((day) => tx.objectStore('workDays').put(day)),
    ...(data.absences ?? []).map((absence) => tx.objectStore('absences').put(absence))
  ]);

  await tx.done;
}
