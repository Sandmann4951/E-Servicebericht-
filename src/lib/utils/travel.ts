import type { TimeEntry } from '../db/types';

type OrderedEntry = Pick<TimeEntry, 'id' | 'date' | 'startTime' | 'createdAt' | 'isTravel' | 'isBreak'>;

/**
 * Ist `entry` (eine Fahrtzeit) die Rückfahrt? Maßgeblich ist der unmittelbar
 * vorhergehende Abschnitt desselben Berichts am selben Tag (`reportEntries`
 * = alle Zeiteinträge dieses Berichts): war das normale Projektzeit (man war
 * beim Kunden), ist es die Rückfahrt. Gab es davor nichts oder war der
 * vorherige Abschnitt selbst eine Fahrtzeit (z.B. die Rückfahrt eines
 * früheren Einsatzes am selben Tag), ist es wieder eine Hinfahrt.
 *
 * Reihenfolge über Startzeit, bei gleicher Minute über createdAt - beim
 * Wechsel Projekt -> Fahrtzeit beginnen beide Abschnitte oft in derselben
 * Minute.
 *
 * Reine Funktion, genutzt von clockActions.isReturnTravel() (Buttons in
 * TimeClock.svelte) und der Zeiten-Tabelle im Word-Export
 * (export/timesheetRows.ts) - damit beide Stellen Hin-/Rückfahrt garantiert
 * gleich einordnen.
 */
export function isReturnTravelAmong(reportEntries: readonly OrderedEntry[], entry: OrderedEntry): boolean {
  const start = entry.startTime;
  if (!start) return false;
  const isBefore = (other: OrderedEntry): boolean =>
    other.startTime !== undefined &&
    (other.startTime < start || (other.startTime === start && other.createdAt < entry.createdAt));
  const previous = reportEntries
    .filter((other) => other.id !== entry.id && other.date === entry.date && !other.isBreak && isBefore(other))
    .sort((a, b) => a.startTime!.localeCompare(b.startTime!) || a.createdAt.localeCompare(b.createdAt))
    .at(-1);
  return previous !== undefined && !previous.isTravel;
}
