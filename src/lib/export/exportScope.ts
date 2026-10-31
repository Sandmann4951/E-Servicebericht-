import type { MaterialItem, ServiceReport, TimeEntry } from '../db/types';
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

/** true, wenn mindestens ein Zeiteintrag oder ein Material-Rest noch nicht berichtet ist - wenn false, hat "Nur Neues" nichts zu exportieren. */
export function hasUnreportedContent(data: Pick<FullReport, 'timeEntries' | 'materialItems'>): boolean {
  return data.timeEntries.some((entry) => !isTimeEntryReported(entry)) || data.materialItems.some((item) => !isMaterialItemFullyReported(item));
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
  return { ...data, timeEntries, materialItems };
}
