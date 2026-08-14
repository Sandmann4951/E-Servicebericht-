import { listAbsencesInRange } from '../db/absences';
import { getBundesland, getWeeklyTargetHours } from '../settings';
import { getGermanHolidays } from './holidays';

export interface MonthTarget {
  /** Soll-Arbeitszeit für den Monat, in Minuten. */
  targetMinutes: number;
  /** Anzahl der Werktage, aus denen sich targetMinutes ergibt (fürs Debugging/Anzeige-Feingefühl). */
  workingDays: number;
}

/**
 * Soll-Stunden für einen Kalendermonat ("YYYY-MM"): Anzahl der Werktage
 * (Mo-Fr), die weder Feiertag noch als Urlaub/Krank eingetragen sind, mal
 * Sollstunden pro Tag (Sollstunden pro Woche ÷ 5 - Annahme 5-Tage-Woche,
 * siehe Hinweistext in Einstellungen.svelte).
 *
 * Bewusst ein "Ausschluss"-Modell für Urlaub/Krank: an diesen Tagen MUSS
 * weniger gearbeitet werden, das Soll sinkt also automatisch mit jedem
 * Urlaubs-/Kranktag, statt die fehlende Zeit mit einer fiktiven Ist-Zeit
 * "gutzuschreiben" - einfacher zu verstehen, und die Ist-Berechnung
 * (getDayStats()) bleibt dadurch unverändert, kennt Abwesenheiten gar nicht.
 *
 * Zeitausgleich (ZA) wird bewusst NICHT ausgeschlossen: ein ZA-Tag baut
 * bereits an anderer Stelle erarbeitete Überstunden ab, indem an diesem Tag
 * einfach weniger/nicht gestempelt wird - das Soll bleibt unverändert, die
 * niedrigere Ist-Zeit an diesem Tag spiegelt den ZA-Abbau ganz von selbst in
 * der Differenz wider. Das Soll zusätzlich zu senken würde den Effekt
 * doppelt zählen (die App führt bewusst kein monatsübergreifendes
 * Zeitkonto/Überstunden-Saldo, siehe README).
 */
export async function getMonthTarget(yearMonth: string): Promise<MonthTarget> {
  const [year, month] = yearMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStart = `${yearMonth}-01`;
  const monthEnd = `${yearMonth}-${String(daysInMonth).padStart(2, '0')}`;

  const absences = await listAbsencesInRange(monthStart, monthEnd);
  const absenceDates = new Set(
    absences.filter((absence) => absence.type === 'vacation' || absence.type === 'sick').map((absence) => absence.date)
  );
  const holidays = getGermanHolidays(year, getBundesland());
  const weeklyTargetHours = getWeeklyTargetHours();

  let workingDays = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getDay(); // 0 = Sonntag, 6 = Samstag
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;
    const iso = `${yearMonth}-${String(day).padStart(2, '0')}`;
    if (holidays.has(iso)) continue;
    if (absenceDates.has(iso)) continue;
    workingDays += 1;
  }

  const targetMinutesPerDay = (weeklyTargetHours / 5) * 60;
  return { targetMinutes: Math.round(workingDays * targetMinutesPerDay), workingDays };
}
