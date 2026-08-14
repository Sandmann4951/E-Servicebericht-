import { listAbsencesInRange } from '../db/absences';
import { getBundesland, getWeeklyTargetHours } from '../settings';
import { getGermanHolidays } from './holidays';

export interface MonthTarget {
  /** Soll-Arbeitszeit für den Monat, in Minuten - unabhängig von Abwesenheiten (siehe unten). */
  targetMinutes: number;
  /** Anzahl der Werktage, aus denen sich targetMinutes ergibt (fürs Debugging/Anzeige-Feingefühl). */
  workingDays: number;
  /** Anzahl Urlaubs-/Kranktage im Zeitraum, die als Ist-Zeit angerechnet werden (s.u.). */
  creditedAbsenceDays: number;
  /** creditedAbsenceDays × Sollstunden pro Tag, in Minuten - wird zur tatsächlich gearbeiteten Zeit addiert, um die angezeigte Ist-Zeit zu bilden. */
  creditedAbsenceMinutes: number;
}

/**
 * Soll-Stunden für einen Kalendermonat ("YYYY-MM"): Anzahl der Werktage
 * (Mo-Fr) ohne gesetzlichen Feiertag, mal Sollstunden pro Tag (Sollstunden
 * pro Woche ÷ 5 - Annahme 5-Tage-Woche, siehe Hinweistext in
 * Einstellungen.svelte).
 *
 * "Gutschrift"-Modell (statt Ausschluss): das Soll bleibt für den Monat FIX
 * - es sinkt nicht durch Urlaub/Krank. Stattdessen werden Urlaubs-/Kranktage
 * als Ist-Zeit angerechnet (siehe `creditedAbsenceMinutes`, vom Aufrufer zur
 * tatsächlich gearbeiteten Zeit zu addieren): so zeigt die Differenz auf
 * einen Blick, wie viel vom festen Soll bereits durch Arbeit UND Urlaub/
 * Krank abgedeckt ist, und wie viel noch offen ist. Nur Tage, die auch
 * unabhängig von der Abwesenheit ein Werktag wären (kein Wochenende, kein
 * Feiertag), werden angerechnet - ein Urlaubstag an einem Samstag hätte
 * ohnehin kein Soll und würde sonst einen künstlichen Überschuss erzeugen.
 *
 * Zeitausgleich (ZA) wird bewusst NICHT angerechnet: ein ZA-Tag baut
 * bereits an anderer Stelle erarbeitete Überstunden ab, indem an diesem Tag
 * einfach weniger/nicht gestempelt wird - die dadurch niedrigere
 * tatsächliche Ist-Zeit spiegelt den ZA-Abbau ganz von selbst in der
 * Differenz wider. Eine zusätzliche Gutschrift würde den Effekt doppelt
 * zählen (die App führt bewusst kein monatsübergreifendes Zeitkonto/
 * Überstunden-Saldo, siehe README).
 */
export async function getMonthTarget(yearMonth: string): Promise<MonthTarget> {
  const [year, month] = yearMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStart = `${yearMonth}-01`;
  const monthEnd = `${yearMonth}-${String(daysInMonth).padStart(2, '0')}`;

  const absences = await listAbsencesInRange(monthStart, monthEnd);
  const holidays = getGermanHolidays(year, getBundesland());
  const weeklyTargetHours = getWeeklyTargetHours();
  const targetMinutesPerDay = (weeklyTargetHours / 5) * 60;

  const workdayDates = new Set<string>();
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getDay(); // 0 = Sonntag, 6 = Samstag
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;
    const iso = `${yearMonth}-${String(day).padStart(2, '0')}`;
    if (holidays.has(iso)) continue;
    workdayDates.add(iso);
  }

  const creditedAbsenceDays = absences.filter(
    (absence) => (absence.type === 'vacation' || absence.type === 'sick') && workdayDates.has(absence.date)
  ).length;

  return {
    targetMinutes: Math.round(workdayDates.size * targetMinutesPerDay),
    workingDays: workdayDates.size,
    creditedAbsenceDays,
    creditedAbsenceMinutes: Math.round(creditedAbsenceDays * targetMinutesPerDay)
  };
}
