import { formatDateDE } from './date';

/** "10.08.2026, 08:00–12:00: Sicherung ersetzt" - ohne Start/Ende nur "10.08.2026: ...". */
export function formatTimeEntryPerformedWorkLine(
  entry: { date: string; startTime?: string; endTime?: string },
  note: string
): string {
  const timeRange = entry.startTime && entry.endTime ? `, ${entry.startTime}–${entry.endTime}` : '';
  // Zeilenumbrüche in der Notiz würden die "eine Zeile pro Zeitabschnitt"-Zuordnung zerstören.
  return `${formatDateDE(entry.date)}${timeRange}: ${note.trim().replace(/\s*\n+\s*/g, ' ')}`;
}

/** Hängt `line` ans Ende von `performedWork` an (neue Zeile) - ein vorher leeres Feld wird einfach mit dieser einen Zeile befüllt. */
export function appendPerformedWorkLine(performedWork: string | undefined, line: string): string {
  const existing = performedWork?.trim();
  return existing ? `${existing}\n${line}` : line;
}

/**
 * Bringt die Zeile EINES Zeiteintrags in "Durchgeführte Arbeiten" auf Stand.
 * `previousLine` ist die zuletzt für diesen Eintrag geschriebene Zeile
 * (TimeEntry.performedWorkLine), `desiredLine` die jetzt gewünschte
 * (undefined = Notiz wurde geleert).
 *
 * - Noch nie geschrieben: anhängen, außer genau diese Zeile steht schon da.
 * - Schon geschrieben und unverändert auffindbar: ersetzen bzw. entfernen.
 * - Schon geschrieben, aber nicht mehr auffindbar: der Monteur hat den Text
 *   von Hand umformuliert - dann bleibt er unangetastet.
 */
export function applyNoteLine(
  performedWork: string | undefined,
  previousLine: string | undefined,
  desiredLine: string | undefined
): string {
  const text = performedWork ?? '';
  if (previousLine === desiredLine) return text;
  const lines = text.split('\n');

  if (previousLine === undefined) {
    if (desiredLine === undefined || lines.includes(desiredLine)) return text;
    return appendPerformedWorkLine(text, desiredLine);
  }

  const index = lines.indexOf(previousLine);
  if (index === -1) return text;
  if (desiredLine === undefined) lines.splice(index, 1);
  else lines[index] = desiredLine;
  return lines.join('\n').trim();
}
