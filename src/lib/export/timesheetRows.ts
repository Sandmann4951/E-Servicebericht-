import type { TimeEntry } from '../db/types';
import { formatDateDE, parseTimeToMinutes } from '../utils/date';
import { isReturnTravelAmong } from '../utils/travel';

/** Ab dieser Tages-Arbeitszeit (Fahrzeit + Arbeitszeit, Pause bereits abgezogen) zählt der Rest als Ü-Std. */
export const REGULAR_DAILY_MINUTES = 8 * 60;

/**
 * Eine Zeile der "Zeiten"-Tabelle im Word-Export - eine pro Kalendertag.
 * Alle Werte sind bereits fertig formatierte Strings (leer = Zelle bleibt
 * leer), die Vorlage trägt sie 1:1 ein (docxtemplater-Loop `{#timeRows}`).
 */
export interface TimesheetRow {
  date: string;
  technician: string;
  /** Hinfahrt(en) des Tages: Fahrzeit in Std. (Dezimal) und Km. */
  outboundTravel: string;
  outboundKm: string;
  /** Arbeitszeit von/bis: Beginn der ersten bzw. Ende der letzten Projektzeit des Tages. */
  from: string;
  to: string;
  /** Reine Arbeitszeit (ohne Fahrzeit), Pause bereits abgezogen. */
  hours: string;
  /** Alles über 8 Std. von Fahrzeit + Arbeitszeit (Pause bereits abgezogen). */
  overtime: string;
  pause: string;
  /** Rückfahrt(en) des Tages: Fahrzeit in Std. (Dezimal) und Km. */
  returnTravel: string;
  returnKm: string;
}

export interface TimesheetTotals {
  outboundTravel: string;
  outboundKm: string;
  hours: string;
  overtime: string;
  returnTravel: string;
  returnKm: string;
}

/** Minuten als Dezimalstunden mit Komma, z.B. 450 -> "7,50". */
export function formatDecimalHours(minutes: number): string {
  return (minutes / 60).toFixed(2).replace('.', ',');
}

function formatKm(km: number): string {
  return String(Math.round(km * 10) / 10).replace('.', ',');
}

/** Überschneidung zweier Zeitfenster "HH:mm" in Minuten (ohne Mitternachts-Sonderfall). */
function overlapMinutes(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  const values = [aStart, aEnd, bStart, bEnd].map(parseTimeToMinutes);
  if (values.some((value) => value === undefined)) return 0;
  const [as, ae, bs, be] = values as number[];
  return Math.max(0, Math.min(ae, be) - Math.max(as, bs));
}

/**
 * Baut aus den Zeiteinträgen eines Berichts die Zeilen der "Zeiten"-Tabelle
 * im Word-Export - eine Zeile pro Kalendertag:
 * - Anfahrt/Abfahrt: Summe der Hin- bzw. Rückfahrten des Tages (Einordnung
 *   wie bei den Buttons, siehe isReturnTravelAmong()) samt Kilometern.
 * - von/bis: Beginn der ersten bzw. Ende der letzten Projektzeit.
 * - Stunden: Summe der Projektzeit. Pausen sind dort bereits herausgeschnitten
 *   (siehe clockActions.addManualBreak()), werden also nicht doppelt abgezogen.
 * - Pause: Pausen-Einträge des Tages (`breaks`, haben keine reportId), soweit
 *   sie zwischen von und bis liegen.
 * - Ü-Std.: Fahrzeit + Stunden über 8 Std. hinaus.
 *
 * Noch laufende Einträge (ohne Endzeit) und Pausen werden nicht als
 * Arbeitszeit gezählt.
 */
export function buildTimesheetRows(
  entries: readonly TimeEntry[],
  breaks: readonly TimeEntry[],
  technicianName: string | undefined
): { rows: TimesheetRow[]; totals: TimesheetTotals } {
  const counted = entries.filter((entry) => !entry.isBreak && entry.durationMinutes !== undefined && (entry.endTime || !entry.startTime));
  const dates = [...new Set(counted.map((entry) => entry.date))].sort();

  const sum = { outboundTravel: 0, outboundKm: 0, hours: 0, overtime: 0, returnTravel: 0, returnKm: 0 };
  const rows = dates.map((date): TimesheetRow => {
    const ofDay = counted.filter((entry) => entry.date === date);
    const work = ofDay.filter((entry) => !entry.isTravel);
    const travel = ofDay.filter((entry) => entry.isTravel);

    let outboundMinutes = 0;
    let outboundKm = 0;
    let returnMinutes = 0;
    let returnKm = 0;
    for (const entry of travel) {
      if (isReturnTravelAmong(entries, entry)) {
        returnMinutes += entry.durationMinutes ?? 0;
        returnKm += entry.kilometers ?? 0;
      } else {
        outboundMinutes += entry.durationMinutes ?? 0;
        outboundKm += entry.kilometers ?? 0;
      }
    }

    const workMinutes = work.reduce((total, entry) => total + (entry.durationMinutes ?? 0), 0);
    const starts = work.map((entry) => entry.startTime).filter((time): time is string => !!time).sort();
    const ends = work.map((entry) => entry.endTime).filter((time): time is string => !!time).sort();
    const from = starts[0] ?? '';
    const to = ends.at(-1) ?? '';

    const pauseMinutes =
      from && to
        ? breaks
            .filter((entry) => entry.isBreak && entry.date === date && entry.startTime && entry.endTime)
            .reduce((total, entry) => total + overlapMinutes(entry.startTime!, entry.endTime!, from, to), 0)
        : 0;

    const overtimeMinutes = Math.max(0, outboundMinutes + workMinutes + returnMinutes - REGULAR_DAILY_MINUTES);

    sum.outboundTravel += outboundMinutes;
    sum.outboundKm += outboundKm;
    sum.hours += workMinutes;
    sum.overtime += overtimeMinutes;
    sum.returnTravel += returnMinutes;
    sum.returnKm += returnKm;

    return {
      date: formatDateDE(date),
      technician: technicianName ?? '',
      outboundTravel: outboundMinutes ? formatDecimalHours(outboundMinutes) : '',
      outboundKm: outboundKm ? formatKm(outboundKm) : '',
      from,
      to,
      hours: workMinutes ? formatDecimalHours(workMinutes) : '',
      overtime: overtimeMinutes ? formatDecimalHours(overtimeMinutes) : '',
      pause: pauseMinutes ? formatDecimalHours(pauseMinutes) : '',
      returnTravel: returnMinutes ? formatDecimalHours(returnMinutes) : '',
      returnKm: returnKm ? formatKm(returnKm) : ''
    };
  });

  return {
    rows,
    totals: {
      outboundTravel: formatDecimalHours(sum.outboundTravel),
      outboundKm: formatKm(sum.outboundKm),
      hours: formatDecimalHours(sum.hours),
      overtime: formatDecimalHours(sum.overtime),
      returnTravel: formatDecimalHours(sum.returnTravel),
      returnKm: formatKm(sum.returnKm)
    }
  };
}
