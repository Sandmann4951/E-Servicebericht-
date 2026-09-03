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

export interface DayIdleEntry {
  id: ID;
  startTime?: string;
  endTime?: string;
  minutes: number;
}

/**
 * Die abgeschlossenen Leerlaufzeit-Abschnitte (kein Bericht, keine Pause)
 * eines einzelnen Tages, nach Startzeit sortiert - Grundlage für die
 * Leerlaufzeit-Liste in der Statistik-Tagesansicht. Zeigt sowohl über die
 * Tagesstempeluhr entstandene als auch manuell nachgetragene Abschnitte
 * (siehe clockActions.addManualIdleTime()) gleichermaßen an. Ein gerade noch
 * laufender (offener) Leerlaufzeit-Abschnitt hat keine endTime/duration und
 * wird bewusst ausgeschlossen - er gehört zum aktiven Tagesstempel, nicht zur
 * nachträglichen Bearbeitung hier.
 */
export async function getDayIdleEntries(date: ISODate): Promise<DayIdleEntry[]> {
  const db = await getDB();
  const entries = await db.getAllFromIndex('timeEntries', 'date', date);
  return entries
    .filter((entry) => !entry.reportId && !entry.isBreak && entry.endTime)
    .map((entry) => ({ id: entry.id, startTime: entry.startTime, endTime: entry.endTime, minutes: entry.durationMinutes ?? 0 }))
    .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
}

export interface DayTimelineEntry {
  id: ID;
  kind: 'project' | 'idle' | 'break';
  startTime?: string;
  endTime?: string;
  minutes: number;
  /** Nur bei kind === 'project' gesetzt. */
  reportId?: ID;
  projectNumber?: string;
  customer?: string;
}

/**
 * ALLE abgeschlossenen Zeitabschnitte eines einzelnen Tages (Projekt,
 * Leerlaufzeit und Pause gleichermaßen) in EINER chronologischen Liste,
 * nach Startzeit sortiert - Grundlage für den Zeitverlauf in der
 * Statistik-Tagesansicht. Löst dort die frühere getrennte Darstellung
 * (Projekt-Aufschlüsselung nach Bericht gruppiert, Leerlaufzeit- und
 * Pausen-Liste separat) ab: so lässt sich auf einen Blick nachvollziehen,
 * was an diesem Tag WANN passiert ist (z.B. "erst Leerlaufzeit, dann
 * Projekt X, dann Pause, dann wieder Leerlaufzeit"), statt die Zeiten nach
 * Kategorie sortiert lesen zu müssen. Ein gerade noch laufender (offener)
 * Abschnitt hat keine endTime/duration und wird bewusst ausgeschlossen -
 * er gehört zum aktiven Tagesstempel, nicht zur nachträglichen Bearbeitung.
 */
export async function getDayTimeline(date: ISODate): Promise<DayTimelineEntry[]> {
  const db = await getDB();
  const entries = await db.getAllFromIndex('timeEntries', 'date', date);
  const withDuration = entries.filter((entry) => entry.durationMinutes && entry.startTime && entry.endTime);

  const timeline = await Promise.all(
    withDuration.map(async (entry): Promise<DayTimelineEntry> => {
      const base = { id: entry.id, startTime: entry.startTime, endTime: entry.endTime, minutes: entry.durationMinutes ?? 0 };
      if (entry.isBreak) {
        return { ...base, kind: 'break' };
      }
      if (entry.reportId) {
        const report = await db.get('reports', entry.reportId);
        return {
          ...base,
          kind: 'project',
          reportId: entry.reportId,
          projectNumber: report?.projectNumber ?? 'Unbekannter Bericht',
          customer: report?.customer
        };
      }
      return { ...base, kind: 'idle' };
    })
  );

  return timeline.sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
}
