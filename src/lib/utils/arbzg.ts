/**
 * Gesetzliche Höchstarbeitszeit pro Werktag nach §3 ArbZG (Arbeitszeitgesetz):
 * Die Arbeitszeit darf werktäglich 8 Stunden nicht überschreiten, kann aber
 * auf bis zu 10 Stunden verlängert werden (wenn im Durchschnitt von 6
 * Kalendermonaten bzw. 24 Wochen 8 Stunden werktäglich nicht überschritten
 * werden). 10 Stunden sind damit die praktische Obergrenze für einen
 * einzelnen Arbeitstag - eine Überschreitung ist ein starkes Indiz dafür,
 * dass schlicht vergessen wurde, manuell auszustempeln (z.B. über Nacht
 * eingestempelt geblieben), statt tatsächlich so lange gearbeitet worden zu
 * sein. Grundlage sowohl für das automatische Ausstempeln bei Überschreitung
 * (siehe clockActions.autoCheckOutIfExceeded()) als auch für die farbliche
 * Hervorhebung betroffener Zeiteinträge (TimeEntrySection.svelte,
 * Leerlaufzeiten.svelte, Statistik.svelte).
 */
export const MAX_DAILY_WORK_MINUTES = 10 * 60;

/** true, wenn eine erfasste Dauer (in Minuten) die gesetzliche Höchstarbeitszeit pro Tag überschreitet. */
export function exceedsMaxDailyWork(minutes: number | undefined | null): boolean {
  return (minutes ?? 0) > MAX_DAILY_WORK_MINUTES;
}
