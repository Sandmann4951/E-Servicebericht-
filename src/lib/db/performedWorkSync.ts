import { getDB } from './client';
import { applyNoteLine, formatTimeEntryPerformedWorkLine } from '../utils/performedWorkNote';
import type { ID, TimeEntry } from './types';

function desiredLineFor(entry: TimeEntry): string | undefined {
  return entry.note?.trim() ? formatTimeEntryPerformedWorkLine(entry, entry.note) : undefined;
}

/**
 * Gleicht "Durchgeführte Arbeiten" (ServiceReport.performedWork) mit den
 * Notizen aller Zeiteinträge des Berichts ab: pro Eintrag mit Notiz genau
 * eine Zeile "Datum, von–bis: Notiz". Ändern sich Notiz oder Uhrzeiten
 * (z.B. weil ein laufender Abschnitt ausgecheckt wurde), wird die Zeile
 * ersetzt statt doppelt angehängt - siehe applyNoteLine().
 *
 * Gesperrte Berichte bleiben unverändert. Liefert den aktuellen Text zurück
 * (undefined, wenn es den Bericht nicht gibt).
 */
export async function syncPerformedWorkFromNotes(reportId: ID): Promise<string | undefined> {
  const db = await getDB();
  const tx = db.transaction(['reports', 'timeEntries'], 'readwrite');
  const reports = tx.objectStore('reports');
  const timeEntries = tx.objectStore('timeEntries');

  const report = await reports.get(reportId);
  if (!report) {
    await tx.done;
    return undefined;
  }
  if (report.finalizedAt) {
    await tx.done;
    return report.performedWork ?? '';
  }

  const entries = (await timeEntries.index('reportId').getAll(reportId)).sort(
    (a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? '')
  );

  const original = report.performedWork ?? '';
  let text = original;
  for (const entry of entries) {
    const desired = desiredLineFor(entry);
    if (entry.performedWorkLine === desired) continue;
    text = applyNoteLine(text, entry.performedWorkLine, desired);
    entry.performedWorkLine = desired;
    await timeEntries.put(entry);
  }

  if (text !== original) {
    report.performedWork = text.trim() || undefined;
    report.updatedAt = new Date().toISOString();
    await reports.put(report);
  }
  await tx.done;
  return text;
}
