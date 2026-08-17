import { createReport, getReport, listReportsByProjectNumber } from './db/reports';
import {
  addTimeEntry,
  findOverlappingTimeEntries,
  getGloballyActiveTimeEntry,
  listTimeEntriesForDate,
  trimOverlappingTimeEntries,
  updateTimeEntry
} from './db/timeEntries';
import { checkInWorkDay, checkOutWorkDay, getActiveWorkDay } from './db/workDays';
import type { ID, ServiceReport, WorkDay } from './db/types';
import { nowHHmm, todayISODate } from './utils/date';

export interface DaySummary {
  workDay: WorkDay;
  totalMinutes: number;
  projectMinutes: number;
  /** "Leerlaufzeit": eingestempelt, aber keinem Projekt zugeordnet. */
  idleMinutes: number;
  /** Summe der beim Auschecken erfassten Pausen (siehe checkOutDay()) - bereits NICHT in totalMinutes enthalten. */
  breakMinutes: number;
}

/** Ein beim Tagesauschecken erfasstes Pausenfenster, siehe checkOutDay(). */
export interface BreakInput {
  startTime: string;
  endTime: string;
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
 * Trägt eine Pause für ein beliebiges Zeitfenster ein - Kernstück sowohl von
 * checkOutDay() (Pausen beim Tagesausstempeln) als auch der manuellen
 * Nachtragung eines vergessenen/nachträglichen Pausenfensters in der
 * Auswertung (Statistik.svelte, Tag-Ansicht). Schaut per
 * findOverlappingTimeEntries() nach, welche bereits bestehenden Projekt-/
 * Leerlaufzeit-Abschnitte an diesem Tag in diesem Fenster liegen, schneidet
 * sie per trimOverlappingTimeEntries() heraus (gekürzt/gesplittet/komplett
 * gelöscht - exakt dieselbe Logik wie bei manuell erfassten
 * Überschneidungen) und legt einen eigenen, isBreak-markierten Eintrag für
 * die Pause selbst an (Nachvollziehbarkeit/Lohnabrechnung, sichtbar in der
 * Tages-Statistik) - der zählt nirgends als Arbeitszeit (siehe
 * TimeEntry.isBreak). Die dabei anfallenden TimeEntryTrimRecords (Vorher-
 * Zustand der weggeschnittenen Nachbar-Einträge) werden direkt am
 * Pause-Eintrag gespeichert, damit timeEntries.restoreBreak() die Pause
 * später bei Bedarf wieder rückgängig machen und die weggeschnittene Zeit
 * automatisch gutschreiben kann.
 *
 * `workDayId` bewusst optional: beim Tagesausstempeln (checkOutDay()) wird
 * der gerade beendete Tagesstempel mitgegeben (die Pause zählt dann zur
 * Tagesbilanz dieses Stempels, siehe listTimeEntriesForDate()); beim
 * manuellen Nachtragen für einen beliebigen (auch zurückliegenden) Tag
 * über die Auswertung gibt es keinen zugehörigen Tagesstempel, dort bleibt
 * es undefined - getDayStats()/getDayBreaks() lesen ohnehin direkt über
 * das Datum, nicht über workDayId.
 *
 * Ohne Effekt, wenn `startTime`/`endTime` fehlen.
 */
export async function addManualBreak(date: string, startTime: string, endTime: string, workDayId?: ID): Promise<void> {
  if (!startTime || !endTime) return;
  const overlaps = await findOverlappingTimeEntries(date, startTime, endTime);
  const trimRecords = await trimOverlappingTimeEntries(overlaps, startTime, endTime);
  await addTimeEntry(undefined, {
    date,
    startTime,
    endTime,
    workDayId,
    isBreak: true,
    trimRecords
  });
}

/**
 * Schließt den aktuell offenen Abschnitt (Leerlaufzeit oder Projekt),
 * schneidet optional erfasste Pausen heraus (siehe addManualBreak()) und
 * beendet den Tagesstempel. Gibt die Tageszusammenfassung zurück, oder
 * `undefined`, wenn gerade gar kein Tag läuft.
 *
 * `breaks`: Während einer Pause bleibt man laut Anleitung eingestempelt
 * (Projekt oder Leerlaufzeit läuft einfach weiter) statt extra
 * auszuchecken - beim Tagesausstempeln werden die tatsächlichen
 * Pausenzeiten nachträglich angegeben (der gerade geschlossene Abschnitt
 * zählt für die Überschneidungssuche schon mit, da er oben bereits eine
 * endTime bekommen hat).
 *
 * Die Zusammenfassung umfasst bewusst den GANZEN Kalendertag (`active.date`),
 * nicht nur diesen einen WorkDay-Datensatz: wurde am selben Tag bereits
 * einmal aus- und wieder eingestempelt, entstehen dabei mehrere WorkDay-
 * Einträge mit demselben Datum - deren Zeiten sollen sich zur Tagesbilanz
 * addieren, statt bei jedem erneuten Einstempeln wieder bei 0 anzufangen
 * (siehe listTimeEntriesForDate()).
 */
export async function checkOutDay(breaks: BreakInput[] = []): Promise<DaySummary | undefined> {
  const active = await getActiveWorkDay();
  if (!active) return undefined;

  const openEntry = await getGloballyActiveTimeEntry();
  if (openEntry && openEntry.workDayId === active.id) {
    await updateTimeEntry(openEntry.id, { endTime: nowHHmm() });
  }

  for (const brk of breaks) {
    await addManualBreak(active.date, brk.startTime, brk.endTime, active.id);
  }

  const closedDay = await checkOutWorkDay(active.id);
  if (!closedDay) return undefined;

  const entries = await listTimeEntriesForDate(active.date);
  let projectMinutes = 0;
  let idleMinutes = 0;
  let breakMinutes = 0;
  for (const entry of entries) {
    const minutes = entry.durationMinutes ?? 0;
    if (entry.isBreak) {
      breakMinutes += minutes;
    } else if (entry.reportId) {
      projectMinutes += minutes;
    } else {
      idleMinutes += minutes;
    }
  }
  return {
    workDay: closedDay,
    totalMinutes: projectMinutes + idleMinutes,
    projectMinutes,
    idleMinutes,
    breakMinutes
  };
}

/**
 * Wechselt in ein Projekt: startet bei Bedarf transparent den Tagesstempel
 * (der bisherige "Direkt einchecken"-Schnellzugriff ohne explizites
 * Tages-Einstempeln funktioniert dadurch unverändert weiter), schließt den
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
      `Du bist noch in "${label}" eingecheckt (seit ${current.startTime}). Dort jetzt auschecken und hier neu einchecken?`
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

export interface StartProjectResult {
  report: ServiceReport;
  /** true, wenn ein bereits offener Bericht mit dieser Projektnummer wiederverwendet wurde, statt einen neuen anzulegen. */
  reused: boolean;
  /** Position dieses Berichts unter allen Berichten mit dieser Projektnummer, chronologisch (1 = erster). */
  visitNumber: number;
  /** Gesamtzahl der Berichte mit dieser Projektnummer (inkl. diesem). */
  visitTotal: number;
}

/**
 * Löst eine per Hand eingegebene Projektnummer (Direkt-Einchecken-
 * Schnellzugriff) zu einem Bericht auf - für den Fall, dass es zu dieser
 * Nummer bereits Berichte gibt (wiederkehrender Kunde/Standort):
 *
 * - Existiert bereits ein NICHT gesperrter Bericht mit exakt dieser
 *   Projektnummer, wird DER wiederverwendet statt ein Duplikat anzulegen -
 *   man kann ja nicht zwei offene Berichte parallel zum selben Projekt
 *   führen wollen.
 * - Sonst wird ein neuer Bericht angelegt (auch wenn es zu dieser
 *   Projektnummer bereits abgeschlossene/gesperrte Berichte gibt - z.B. ein
 *   erneuter Einsatz beim selben Kunden). `visitNumber`/`visitTotal` geben
 *   an, der wievielte Bericht zu dieser Projektnummer das ist, damit die
 *   UI das sichtbar machen kann.
 *
 * Prüft bewusst `finalizedAt` (die kanonische Sperre, siehe switchToProject())
 * statt `status`, um das kurze Zeitfenster zwischen dem Setzen von
 * `finalizedAt` beim Unterschreiben und dem etwas später greifenden
 * Autosave-Update von `status` sicher abzudecken.
 */
export async function startProjectByNumber(
  projectNumber: string,
  technicianName?: string
): Promise<StartProjectResult> {
  const trimmed = projectNumber.trim();
  const existing = await listReportsByProjectNumber(trimmed);
  const openExisting = existing.find((report) => !report.finalizedAt);

  if (openExisting) {
    return {
      report: openExisting,
      reused: true,
      visitNumber: existing.indexOf(openExisting) + 1,
      visitTotal: existing.length
    };
  }

  const report = await createReport({ projectNumber: trimmed, technicianName });
  return { report, reused: false, visitNumber: existing.length + 1, visitTotal: existing.length + 1 };
}
