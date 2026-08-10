/** Kleine, abhängigkeitsfreie Datums-/Zeit-Helfer für die App. */

/** Heutiges Datum als "YYYY-MM-DD" (für input[type=date]-Defaultwerte). */
export function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseTimeToMinutes(value: string): number | undefined {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return undefined;
  return hours * 60 + minutes;
}

/**
 * Berechnet die Dauer in Minuten zwischen zwei "HH:mm"-Zeiten. Liefert
 * `undefined` bei ungültigem Format oder wenn das Ende vor dem Start liegt
 * (z.B. Tippfehler) - in dem Fall bleibt ein zuvor manuell gesetzter Wert
 * unangetastet, statt einen negativen/falschen Wert zu speichern.
 */
export function computeDurationMinutes(startTime: string, endTime: string): number | undefined {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (start === undefined || end === undefined) return undefined;
  const diff = end - start;
  return diff >= 0 ? diff : undefined;
}

/** Formatiert Minuten als "H:MM Std." für die Anzeige (z.B. "7:30 Std."). */
export function formatDurationMinutes(totalMinutes: number | undefined | null): string {
  const minutesTotal = Math.max(0, totalMinutes ?? 0);
  const hours = Math.floor(minutesTotal / 60);
  const minutes = minutesTotal % 60;
  return `${hours}:${String(minutes).padStart(2, '0')} Std.`;
}

/** Formatiert "YYYY-MM-DD" als deutsches Datum "TT.MM.JJJJ". */
export function formatDateDE(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  if (!year || !month || !day) return isoDate;
  return `${day}.${month}.${year}`;
}

/** Formatiert einen ISO-Zeitstempel als kurzes deutsches Datum+Uhrzeit. */
export function formatDateTimeDE(isoDateTime: string): string {
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) return isoDateTime;
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
