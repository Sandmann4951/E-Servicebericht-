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

export interface DayProjectBreakdown {
  reportId: ID;
  projectNumber: string;
  customer?: string;
  minutes: number;
}

/**
 * Liefert für einen einzelnen Tag, an welchen Berichten wie lange gearbeitet
 * wurde (nur produktive, einem Bericht zugeordnete Zeit - Leerlaufzeit hat
 * keinen Bericht) - Grundlage für die Projekt-Aufschlüsselung in der
 * Statistik-Tagesansicht. Absteigend nach investierter Zeit sortiert.
 */
export async function getDayProjectBreakdown(date: ISODate): Promise<DayProjectBreakdown[]> {
  const db = await getDB();
  const entries = await db.getAllFromIndex('timeEntries', 'date', date);

  const minutesByReport = new Map<ID, number>();
  for (const entry of entries) {
    if (!entry.reportId || !entry.durationMinutes) continue;
    minutesByReport.set(entry.reportId, (minutesByReport.get(entry.reportId) ?? 0) + entry.durationMinutes);
  }

  const breakdown = await Promise.all(
    Array.from(minutesByReport.entries()).map(async ([reportId, minutes]) => {
      const report = await db.get('reports', reportId);
      return {
        reportId,
        projectNumber: report?.projectNumber ?? 'Unbekannter Bericht',
        customer: report?.customer,
        minutes
      };
    })
  );

  return breakdown.sort((a, b) => b.minutes - a.minutes);
}
