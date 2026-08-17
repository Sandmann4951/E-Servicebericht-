import { getDB } from './client';
import type { ID, ISODate } from './types';

export interface DayStats {
  date: ISODate;
  /** Zeit, die einem Bericht zugeordnet ist (reportId gesetzt). */
  productiveMinutes: number;
  /** "Leerlaufzeit": eingestempelt, aber keinem Projekt zugeordnet. */
  idleMinutes: number;
  totalMinutes: number;
}

/**
 * Aggregiert ALLE Zeiteinträge (app-weit, über alle Berichte + Leerlaufzeit)
 * nach Datum - Grundlage für die Tages-/Monats-/Jahres-Statistik. Zählt
 * bewusst jeden TimeEntry mit einer Dauer, nicht nur die über die
 * Tagesstempeluhr entstandenen (workDayId) - so fließen auch manuell im
 * Zeiten-Tab nachgetragene Einträge korrekt in "wie lange gearbeitet" ein.
 * Mehrere Berichte am selben Tag summieren sich ganz natürlich zu einem
 * einzigen DayStats-Eintrag.
 */
export async function getDayStats(): Promise<DayStats[]> {
  const db = await getDB();
  const entries = await db.getAll('timeEntries');
  const byDate = new Map<ISODate, DayStats>();

  for (const entry of entries) {
    const minutes = entry.durationMinutes;
    if (!minutes) continue;
    // Pausen (siehe TimeEntry.isBreak) zählen nirgends als Arbeitszeit -
    // weder produktiv noch Leerlaufzeit.
    if (entry.isBreak) continue;
    let stats = byDate.get(entry.date);
    if (!stats) {
      stats = { date: entry.date, productiveMinutes: 0, idleMinutes: 0, totalMinutes: 0 };
      byDate.set(entry.date, stats);
    }
    if (entry.reportId) {
      stats.productiveMinutes += minutes;
    } else {
      stats.idleMinutes += minutes;
    }
    stats.totalMinutes += minutes;
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/** Ein einzelner gestempelter/erfasster Zeitabschnitt innerhalb eines DayProjectBreakdown-Eintrags. */
export interface DayProjectEntry {
  id: ID;
  startTime?: string;
  endTime?: string;
  minutes: number;
}

export interface DayProjectBreakdown {
  reportId: ID;
  projectNumber: string;
  customer?: string;
  minutes: number;
  /** Die einzelnen Zeiteinträge, aus denen sich `minutes` zusammensetzt - nach Startzeit sortiert. */
  entries: DayProjectEntry[];
}

/**
 * Liefert für einen einzelnen Tag, an welchen Berichten wie lange gearbeitet
 * wurde (nur produktive, einem Bericht zugeordnete Zeit - Leerlaufzeit hat
 * keinen Bericht) - Grundlage für die Projekt-Aufschlüsselung in der
 * Statistik-Tagesansicht. Absteigend nach investierter Zeit sortiert. Enthält
 * pro Bericht zusätzlich die einzelnen gestempelten Zeitabschnitte
 * (`entries`), damit die UI sie bei Bedarf ausklappen kann, statt nur die
 * Gesamtsumme zu zeigen - bei mehreren kurzen Ein-/Auschecks am selben Tag
 * im selben Projekt ist die Summe allein sonst wenig aussagekräftig.
 */
export async function getDayProjectBreakdown(date: ISODate): Promise<DayProjectBreakdown[]> {
  const db = await getDB();
  const entries = await db.getAllFromIndex('timeEntries', 'date', date);

  const entriesByReport = new Map<ID, DayProjectEntry[]>();
  for (const entry of entries) {
    if (!entry.reportId || !entry.durationMinutes) continue;
    const list = entriesByReport.get(entry.reportId) ?? [];
    list.push({ id: entry.id, startTime: entry.startTime, endTime: entry.endTime, minutes: entry.durationMinutes });
    entriesByReport.set(entry.reportId, list);
  }

  const breakdown = await Promise.all(
    Array.from(entriesByReport.entries()).map(async ([reportId, reportEntries]) => {
      const report = await db.get('reports', reportId);
      reportEntries.sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
      return {
        reportId,
        projectNumber: report?.projectNumber ?? 'Unbekannter Bericht',
        customer: report?.customer,
        minutes: reportEntries.reduce((sum, e) => sum + e.minutes, 0),
        entries: reportEntries
      };
    })
  );

  return breakdown.sort((a, b) => b.minutes - a.minutes);
}

export interface DayBreak {
  id: ID;
  startTime?: string;
  endTime?: string;
  minutes: number;
}

/**
 * Die beim Tagesausstempeln erfassten Pausen (siehe clockActions.checkOutDay)
 * eines einzelnen Tages, nach Startzeit sortiert - Grundlage für die
 * Pausen-Liste in der Statistik-Tagesansicht.
 */
export async function getDayBreaks(date: ISODate): Promise<DayBreak[]> {
  const db = await getDB();
  const entries = await db.getAllFromIndex('timeEntries', 'date', date);
  return entries
    .filter((entry) => entry.isBreak)
    .map((entry) => ({ id: entry.id, startTime: entry.startTime, endTime: entry.endTime, minutes: entry.durationMinutes ?? 0 }))
    .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
}
