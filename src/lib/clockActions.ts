import { getReport } from './db/reports';
import { addTimeEntry, getGloballyActiveTimeEntry, listTimeEntriesForWorkDay, updateTimeEntry } from './db/timeEntries';
import { checkInWorkDay, checkOutWorkDay, getActiveWorkDay } from './db/workDays';
import type { ID, WorkDay } from './db/types';
import { nowHHmm, todayISODate } from './utils/date';

export interface DaySummary {
  workDay: WorkDay;
  totalMinutes: number;
  projectMinutes: number;
  /** "Leerlaufzeit": eingestempelt, aber keinem Projekt zugeordnet. */
  idleMinutes: number;
}

/**
 * Startet den Tagesstempel, falls noch keiner läuft, und beginnt sofort
 * Leerlaufzeit-Tracking (ein Tag ist nie "eingestempelt, aber auf nichts" -
 * es läuft immer entweder Leerlaufzeit oder ein Projekt-Abschnitt). Läuft
 * bereits ein Tag, passiert nichts (idempotent).
 */
export async function checkInDay(): Promise<WorkDay> {
  const active = await getActiveWorkDay();
  if (active) return active;
  const day = await checkInWorkDay();
  await addTimeEntry(undefined, { date: todayISODate(), startTime: nowHHmm(), workDayId: day.id });
  return day;
}

/**
 * Schließt den aktuell offenen Abschnitt (Leerlaufzeit oder Projekt) und
 * beendet den Tagesstempel. Gibt die Tageszusammenfassung zurück, oder
 * `undefined`, wenn gerade gar kein Tag läuft.
 */
export async function checkOutDay(): Promise<DaySummary | undefined> {
  const active = await getActiveWorkDay();
  if (!active) return undefined;

  const openEntry = await getGloballyActiveTimeEntry();
  if (openEntry && openEntry.workDayId === active.id) {
    await updateTimeEntry(openEntry.id, { endTime: nowHHmm() });
  }

  const closedDay = await checkOutWorkDay(active.id);
  if (!closedDay) return undefined;

  const entries = await listTimeEntriesForWorkDay(active.id);
  let projectMinutes = 0;
  let idleMinutes = 0;
  for (const entry of entries) {
    const minutes = entry.durationMinutes ?? 0;
    if (entry.reportId) projectMinutes += minutes;
    else idleMinutes += minutes;
  }
  return { workDay: closedDay, totalMinutes: projectMinutes + idleMinutes, projectMinutes, idleMinutes };
}

/**
 * Wechselt in ein Projekt: startet bei Bedarf transparent den Tagesstempel
 * (der bisherige "Direkt einstempeln"-Schnellzugriff ohne expliziten
 * Tages-Check-in funktioniert dadurch unverändert weiter), schließt den
 * aktuell offenen Abschnitt und öffnet einen neuen Projekt-Zeitabschnitt.
 * Bricht ab, wenn der Ziel-Bericht gesperrt ist. Fragt nur beim Wechsel
 * zwischen zwei VERSCHIEDENEN Projekten noch einmal nach (schützt vor
 * versehentlichem Wechsel) - Leerlaufzeit→Projekt oder Projekt→Leerlaufzeit
 * ist erwartetes, alltägliches Verhalten und braucht keine Rückfrage mehr.
 *
 * @returns true, wenn gewechselt wurde; false bei gesperrtem Ziel-Bericht
 * oder abgelehnter Rückfrage.
 */
export async function switchToProject(reportId: ID): Promise<boolean> {
  const targetReport = await getReport(reportId);
  if (!targetReport || targetReport.finalizedAt) return false;

  const day = await checkInDay();
  const current = await getGloballyActiveTimeEntry();

  if (current?.reportId && current.reportId !== reportId) {
    const currentReport = await getReport(current.reportId);
    const label = currentReport?.projectNumber ?? 'einem anderen Bericht';
    const confirmed = confirm(
      `Du bist noch in "${label}" eingestempelt (seit ${current.startTime}). Dort jetzt ausstempeln und hier neu einstempeln?`
    );
    if (!confirmed) return false;
  }

  if (current) {
    await updateTimeEntry(current.id, { endTime: nowHHmm() });
  }
  await addTimeEntry(reportId, { date: todayISODate(), startTime: nowHHmm(), workDayId: day.id });
  return true;
}

/**
 * Checkt aus dem aktuellen Projekt aus - Leerlaufzeit läuft weiter, solange
 * der Tag noch läuft. Kein Effekt, wenn gerade kein Tag aktiv ist.
 */
export async function switchToIdle(): Promise<void> {
  const day = await getActiveWorkDay();
  if (!day) return;
  const current = await getGloballyActiveTimeEntry();
  if (current && current.workDayId === day.id) {
    await updateTimeEntry(current.id, { endTime: nowHHmm() });
  }
  await addTimeEntry(undefined, { date: todayISODate(), startTime: nowHHmm(), workDayId: day.id });
}

/** Ordnet einen bestehenden Leerlaufzeit-Eintrag nachträglich einem Bericht zu. */
export async function reassignIdleEntry(entryId: ID, reportId: ID): Promise<void> {
  await updateTimeEntry(entryId, { reportId });
}
