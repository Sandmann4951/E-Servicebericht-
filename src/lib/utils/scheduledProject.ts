import type { ServiceReport } from '../db/types';

/**
 * Reine, unabhängig testbare Logik rund um die Tagesplanung (welches Projekt
 * ist für einen Kalendertag geplant, siehe db/dayProjectPlans.ts) und deren
 * Auswirkung auf die Sortierung/Markierung in der Projekt-Übersicht
 * (ReportList.svelte).
 */

/** Sucht den Bericht, dessen Projektnummer exakt der geplanten Nummer entspricht (kein Fuzzy-Matching). */
export function findReportByProjectNumber(
  reports: ServiceReport[],
  projectNumber: string | undefined
): ServiceReport | undefined {
  if (!projectNumber) return undefined;
  return reports.find((report) => report.projectNumber === projectNumber);
}

/**
 * Zieht den eingecheckten Bericht (`activeReportId`) und/oder den heute
 * geplanten Bericht (`scheduledReportId`) in der Liste nach vorn - für die
 * Übersicht (ReportList.svelte), damit das aktuell Wichtigste immer sofort
 * sichtbar ist, unabhängig von der sonst üblichen Sortierung nach
 * `updatedAt`. Der eingecheckte Bericht hat Vorrang (landet ganz vorne,
 * "jetzt gerade dran" ist dringender als "heute geplant"); ist er zugleich
 * auch der heute geplante Bericht, ändert sich dadurch nichts. Eine ID, die
 * in `reports` nicht (mehr) vorkommt (z.B. durch Status-Filter/Suche
 * herausgefiltert), wird stillschweigend ignoriert.
 */
export function pinReports<T extends { id: string }>(
  reports: T[],
  activeReportId: string | undefined,
  scheduledReportId: string | undefined
): T[] {
  const result = [...reports];

  function pin(id: string | undefined): void {
    if (!id) return;
    const index = result.findIndex((report) => report.id === id);
    if (index <= 0) return;
    const [item] = result.splice(index, 1);
    result.unshift(item);
  }

  pin(scheduledReportId);
  pin(activeReportId);
  return result;
}
