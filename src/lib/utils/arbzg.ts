/**
 * Gesetzliche Höchstarbeitszeit pro Werktag nach §3 ArbZG (Arbeitszeitgesetz):
 * Die Arbeitszeit darf werktäglich 8 Stunden nicht überschreiten, kann aber
 * auf bis zu 10 Stunden verlängert werden (wenn im Durchschnitt von 6
 * Kalendermonaten bzw. 24 Wochen 8 Stunden werktäglich nicht überschritten
 * werden). 10 Stunden sind damit die praktische Obergrenze für die reine
 * Arbeitszeit an einem einzelnen Tag - Grundlage für die farbliche
 * Hervorhebung einzelner Zeiteinträge (TimeEntrySection.svelte,
 * Leerlaufzeiten.svelte, Statistik.svelte): ein einzelner Projekt-/
 * Leerlaufzeit-Abschnitt (bereits um evtl. erfasste Pausen bereinigt, siehe
 * TimeEntry.isBreak) über dieser Grenze ist ein starkes Indiz dafür, dass
 * schlicht vergessen wurde, manuell auszustempeln.
 */
export const MAX_DAILY_WORK_MINUTES = 10 * 60;

/**
 * Gesetzlich vorgeschriebene Mindest-Ruhepause nach §4 ArbZG bei einer
 * Arbeitszeit von mehr als 9 Stunden: 30 Minuten bei mehr als 6 bis zu 9
 * Stunden, insgesamt 45 Minuten bei mehr als 9 Stunden (die 30 Minuten sind
 * darin enthalten, nicht zusätzlich - "0,5h nach 6 Std. + 0,25h weitere nach
 * 9 Std." ergibt in Summe 45 Minuten, nicht 75).
 */
export const MANDATORY_BREAK_MINUTES = 45;

/**
 * Obergrenze für die seit dem Einstempeln VERSTRICHENE Zeit (nicht die reine
 * Arbeitszeit): Höchstarbeitszeit (§3 ArbZG) PLUS die bei einem vollen
 * 10-Stunden-Tag gesetzlich vorgeschriebene Pause (§4 ArbZG) - wer laut
 * Anleitung während der Pause eingestempelt bleibt und die Pause erst beim
 * Ausstempeln nachträgt (siehe clockActions.checkOutDay()), ist bei 10 Std.
 * Arbeit plus 45 Min. Pflichtpause 10 Std. 45 Min. am Stück eingestempelt -
 * das ist noch völlig legal und darf nicht schon bei genau 10 Std. verstrichener
 * Zeit als "vergessen auszustempeln" gewertet werden. Grundlage für
 * clockActions.autoCheckOutIfExceeded().
 */
export const MAX_DAILY_CLOCKED_MINUTES = MAX_DAILY_WORK_MINUTES + MANDATORY_BREAK_MINUTES;

/** true, wenn eine erfasste Dauer (in Minuten) die gesetzliche Höchstarbeitszeit pro Tag überschreitet. */
export function exceedsMaxDailyWork(minutes: number | undefined | null): boolean {
  return (minutes ?? 0) > MAX_DAILY_WORK_MINUTES;
}
