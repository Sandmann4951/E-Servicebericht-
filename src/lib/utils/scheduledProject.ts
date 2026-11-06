import type { ServiceReport } from '../db/types';

/**
 * Reine, unabhängig testbare Logik rund um die Tagesplanung (welche Projekte
 * sind für einen Kalendertag geplant, siehe db/dayProjectPlans.ts) und deren
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
 * Sucht zu einer Liste geplanter Projektnummern (in der Reihenfolge, in der
 * sie für den Tag eingetragen wurden, siehe listDayProjectPlansForDate() in
 * dayProjectPlans.ts) die jeweils passenden Berichte - behält diese
 * Reihenfolge bei. Projektnummern ohne (noch) existierenden Bericht werden
 * übersprungen (kein Eintrag, kein Fehler).
 */
export function findReportsByProjectNumbers(reports: ServiceReport[], projectNumbers: string[]): ServiceReport[] {
  return projectNumbers
    .map((projectNumber) => findReportByProjectNumber(reports, projectNumber))
    .filter((report): report is ServiceReport => report !== undefined);
}

/**
 * Zieht den eingecheckten Bericht (`activeReportId`) und/oder die heute
 * geplanten Berichte (`scheduledReportIds`) in der Liste nach vorn - für die
 * Übersicht (ReportList.svelte), damit das aktuell Wichtigste immer sofort
 * sichtbar ist, unabhängig von der sonst üblichen Sortierung nach
 * `updatedAt`. Reihenfolge ganz vorne: eingecheckter Bericht zuerst ("jetzt
 * gerade dran" ist dringender als "heute geplant"), danach die geplanten
 * Berichte in der übergebenen Reihenfolge. Ist der eingecheckte Bericht
 * zugleich einer der geplanten, taucht er nur einmal (ganz vorne) auf. Eine
 * ID, die in `reports` nicht (mehr) vorkommt (z.B. durch Status-Filter/Suche
 * herausgefiltert), wird stillschweigend ignoriert.
 */
export function pinReports<T extends { id: string }>(
  reports: T[],
  activeReportId: string | undefined,
  scheduledReportIds: string[]
): T[] {
  const result = [...reports];
  const pinned = new Set<string>();

  function pin(id: string | undefined): void {
    if (!id || pinned.has(id)) return;
    pinned.add(id);
    const index = result.findIndex((report) => report.id === id);
    if (index < 0) return;
    const [item] = result.splice(index, 1);
    result.unshift(item);
  }

  // Niedrigste Priorität zuerst pinnen, höchste zuletzt: jedes unshift()
  // schiebt den gerade gepinnten Eintrag ganz nach vorn, daher ergibt die
  // umgekehrte Verarbeitungsreihenfolge am Ende exakt die gewünschte
  // Priorität (eingecheckt > erstes geplantes Projekt > ... > letztes).
  for (let i = scheduledReportIds.length - 1; i >= 0; i--) {
    pin(scheduledReportIds[i]);
  }
  pin(activeReportId);

  return result;
}
