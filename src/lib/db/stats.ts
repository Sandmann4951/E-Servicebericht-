import { getDB } from './client';
import type { ISODate } from './types';

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
