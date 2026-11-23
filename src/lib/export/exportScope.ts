import type { MaterialItem, Photo, ServiceReport, TimeEntry } from '../db/types';
import type { FullReport } from './getFullReport';

/**
 * Reine, unabhängig testbare Logik rund um "was wurde bei einem Bericht
 * bereits exportiert/berichtet, was ist noch neu" - Grundlage für den
 * Export-Modus "Alles" vs. "Nur Neues seit letztem Export" in
 * ReportDetail.svelte exportReport() sowie für die "berichtet"-Kennzeichnung
 * in TimeEntrySection.svelte/MaterialSection.svelte.
 *
 * Hintergrund: Wird ein bereits exportierter Bericht später (z.B. wegen
 * eines Gewährleistungs-Folgeeinsatzes) wieder entsperrt und um weitere
 * Zeiten/Material ergänzt, soll beim nächsten Export wählbar sein, ob
 * wirklich alles nochmal raus soll, oder nur das seither Neue - ohne dabei
 * bereits abgerechnetes Material doppelt zu berichten.
 */

/** true, wenn dieser Bericht noch NIE exportiert wurde - dann gibt es nichts "Altes" und die Abfrage entfällt (siehe exportReport()). */
export function reportNeverExported(report: Pick<ServiceReport, 'exportedAt'>): boolean {
  return !report.exportedAt;
}

/** Noch nicht berichtete Menge dieser Materialposition - niemals negativ, auch wenn reportedQuantity nachträglich größer als quantity geworden wäre (z.B. Menge nachträglich reduziert). */
export function remainingMaterialQuantity(item: Pick<MaterialItem, 'quantity' | 'reportedQuantity'>): number {
  return Math.max(0, item.quantity - (item.reportedQuantity ?? 0));
}

/** Siehe TimeEntry.reportedAt. */
export function isTimeEntryReported(entry: Pick<TimeEntry, 'reportedAt'>): boolean {
  return !!entry.reportedAt;
}

/** true, wenn von dieser Materialposition nichts mehr offen ist (Rest = 0). */
export function isMaterialItemFullyReported(item: Pick<MaterialItem, 'quantity' | 'reportedQuantity'>): boolean {
  return remainingMaterialQuantity(item) <= 0;
}

/**
 * Ist dieses Foto schon in einem Export gewesen? Fotos werden erst seit
 * Kurzem einzeln markiert (Photo.reportedAt). Bei einem Bericht, der zuvor
 * schon exportiert wurde, ohne dass dabei ein Foto markiert wurde, gelten
 * alle bis zum letzten Export hochgeladenen Fotos als berichtet.
 */
export function isPhotoReported(photo: Pick<Photo, 'reportedAt' | 'takenAt'>, report: Pick<ServiceReport, 'exportedAt'>, allPhotos: readonly Pick<Photo, 'reportedAt'>[]): boolean {
  if (photo.reportedAt) return true;
  if (!report.exportedAt || allPhotos.some((other) => other.reportedAt)) return false;
  return photo.takenAt <= report.exportedAt;
}

/**
 * "Durchgeführte Arbeiten" ohne die Zeilen, die schon berichtet wurden: was
 * beim letzten Export schon dastand (`reportedPerformedWork`), und die
 * Zeilen bereits berichteter Zeitabschnitte (TimeEntry.performedWorkLine) -
 * letzteres greift auch bei Berichten, die vor Einführung von
 * `reportedPerformedWork` exportiert wurden.
 */
export function unreportedPerformedWork(
  report: Pick<ServiceReport, 'performedWork' | 'reportedPerformedWork'>,
  timeEntries: readonly Pick<TimeEntry, 'reportedAt' | 'performedWorkLine'>[]
): string {
  const done = new Set(
    (report.reportedPerformedWork ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  );
  for (const entry of timeEntries) {
    if (isTimeEntryReported(entry) && entry.performedWorkLine) done.add(entry.performedWorkLine.trim());
  }
  return (report.performedWork ?? '')
    .split('\n')
    .filter((line) => line.trim() && !done.has(line.trim()))
    .join('\n');
}

/** true, wenn es seit dem letzten Export irgendetwas Neues gibt - wenn false, hat "Nur Neues" nichts zu exportieren. */
export function hasUnreportedContent(
  data: Pick<FullReport, 'timeEntries' | 'materialItems'> & Partial<Pick<FullReport, 'photos' | 'report'>>
): boolean {
  const photos = (data.photos ?? []).filter((photo) => !photo.excludeFromReport);
  return (
    data.timeEntries.some((entry) => !isTimeEntryReported(entry)) ||
    data.materialItems.some((item) => !isMaterialItemFullyReported(item)) ||
    (!!data.report && photos.some((photo) => !isPhotoReported(photo, data.report!, data.photos!))) ||
    (!!data.report && unreportedPerformedWork(data.report, data.timeEntries) !== '')
  );
}

/**
 * Reduziert `data` auf das noch nicht Berichtete - für den Export-Modus
 * "Nur Neues seit letztem Export" (siehe exportReport()). Bereits
 * vollständig berichtete Zeiteinträge/Materialpositionen fallen ganz weg;
 * bei einer Materialposition mit Teil-Rest bleibt ihre `id` (und damit die
 * Zuordnung zur echten DB-Position) erhalten, aber ihre `quantity` wird für
 * den Export auf den offenen Rest reduziert - die echte, in der Datenbank
 * gespeicherte Menge bleibt davon unberührt, diese Reduktion existiert nur
 * in der hier zurückgegebenen Kopie, die direkt in buildReportDocx() einfließt.
 */
export function filterToUnreportedOnly(data: FullReport): FullReport {
  const timeEntries = data.timeEntries.filter((entry) => !isTimeEntryReported(entry));
  const materialItems = data.materialItems
    .filter((item) => !isMaterialItemFullyReported(item))
    .map((item) => ({ ...item, quantity: remainingMaterialQuantity(item) }));
  const photos = data.photos.filter((photo) => !isPhotoReported(photo, data.report, data.photos));
  const performedWork = unreportedPerformedWork(data.report, data.timeEntries) || undefined;
  return { ...data, report: { ...data.report, performedWork }, timeEntries, materialItems, photos };
}
