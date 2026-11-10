import type { TimeEntry } from '../db/types';

export interface CurrentWorkTarget {
  entry: TimeEntry;
  /** 'active' = gerade eingecheckt, 'today' = letzter bereits beendeter Abschnitt von heute. */
  mode: 'active' | 'today';
}

/**
 * Bestimmt den Zeitabschnitt, dem das Feld "Woran arbeitest du gerade?" in
 * der Übersicht zugeordnet wird: der laufende Abschnitt dieses Berichts,
 * sonst der zuletzt begonnene Abschnitt von heute ("Was hast du heute
 * gemacht?"). Gibt es keinen von beiden, gibt es nichts zuzuordnen.
 */
export function pickCurrentWorkEntry(entries: readonly TimeEntry[], today: string): CurrentWorkTarget | undefined {
  const candidates = entries.filter((entry) => !entry.isBreak && entry.startTime);
  const byStart = (a: TimeEntry, b: TimeEntry): number =>
    a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? '');

  const active = candidates.filter((entry) => !entry.endTime).sort(byStart).at(-1);
  if (active) return { entry: active, mode: 'active' };

  const todays = candidates.filter((entry) => entry.date === today).sort(byStart);
  // Arbeitszeit vor Fahrtzeit: die Rückfahrt ist meist der letzte Abschnitt des Tages.
  const latest = todays.filter((entry) => !entry.isTravel).at(-1) ?? todays.at(-1);
  return latest ? { entry: latest, mode: 'today' } : undefined;
}
