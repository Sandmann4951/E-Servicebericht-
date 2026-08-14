import type { AbsenceType, ISODate } from '../db/types';

/**
 * Einfärbung eines einzelnen Tages in der Kalender-Ansicht der Statistik.
 * Die drei Abwesenheits-Werte sind bewusst identisch zu `AbsenceType`
 * benannt - eine Abwesenheit "ist" direkt ihr Tages-Status, keine separate
 * Umbenennung nötig.
 */
export type DayStatus = AbsenceType | 'holiday' | 'booked' | 'weekend' | 'open';

export interface DayStatusInput {
  date: ISODate;
  isHoliday: boolean;
  absenceType?: AbsenceType;
  hasBookedTime: boolean;
}

/**
 * Bestimmt, wie ein einzelner Tag in der Kalender-Ansicht eingefärbt wird.
 * Priorität (höher gewinnt): eine bewusst eingetragene Abwesenheit >
 * Feiertag > bereits gebuchte Zeit > Wochenende > offener Werktag. Eine
 * Abwesenheit schlägt auch Feiertag/Wochenende, weil sie eine explizite
 * Nutzerentscheidung ist, die trotzdem sichtbar bleiben soll (z.B. Urlaub,
 * der zufällig auf einen Brückentag/Feiertag fällt).
 */
export function computeDayStatus(input: DayStatusInput): DayStatus {
  if (input.absenceType) return input.absenceType;
  if (input.isHoliday) return 'holiday';
  if (input.hasBookedTime) return 'booked';

  const [year, month, day] = input.date.split('-').map(Number);
  const dayOfWeek = new Date(year, month - 1, day).getDay(); // 0 = Sonntag, 6 = Samstag
  if (dayOfWeek === 0 || dayOfWeek === 6) return 'weekend';

  return 'open';
}
