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
 * (Mo-Fr), die weder Feiertag noch als Abwesenheit (Urlaub/Krank/
 * Zeitausgleich, siehe db/absences.ts) eingetragen sind, mal Sollstunden pro
 * Tag (Sollstunden pro Woche ÷ 5 - Annahme 5-Tage-Woche, siehe Hinweistext in
 * Einstellungen.svelte).
 *
 * Bewusst ein "Ausschluss"-Modell: Abwesenheitstage fließen weder in den Soll-
 * noch in den Ist-Wert ein, statt sie mit einer fiktiven Ist-Zeit
 * "gutzuschreiben" - einfacher zu verstehen (Soll sinkt automatisch mit jeder
 * Abwesenheit) und ohne Sonderfall in der Ist-Berechnung (getDayStats() bleibt
 * unverändert, kennt Abwesenheiten gar nicht).
 */
export async function getMonthTarget(yearMonth: string): Promise<MonthTarget> {
  const [year, month] = yearMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStart = `${yearMonth}-01`;
  const monthEnd = `${yearMonth}-${String(daysInMonth).padStart(2, '0')}`;

  const absences = await listAbsencesInRange(monthStart, monthEnd);
  const absenceDates = new Set(absences.map((absence) => absence.date));
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
