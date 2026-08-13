/**
 * Gesetzliche Feiertage in Deutschland - für die Soll-/Ist-Stunden-Berechnung
 * in der Statistik (Feiertage zählen nicht als Soll-Arbeitstag). Rein
 * client-seitig berechnet, keine externe API/Bibliothek nötig.
 */

export type Bundesland = 'BW' | 'BY' | 'BE' | 'BB' | 'HB' | 'HH' | 'HE' | 'MV' | 'NI' | 'NW' | 'RP' | 'SL' | 'SN' | 'ST' | 'SH' | 'TH';

export const BUNDESLAENDER: { code: Bundesland; label: string }[] = [
  { code: 'BW', label: 'Baden-Württemberg' },
  { code: 'BY', label: 'Bayern' },
  { code: 'BE', label: 'Berlin' },
  { code: 'BB', label: 'Brandenburg' },
  { code: 'HB', label: 'Bremen' },
  { code: 'HH', label: 'Hamburg' },
  { code: 'HE', label: 'Hessen' },
  { code: 'MV', label: 'Mecklenburg-Vorpommern' },
  { code: 'NI', label: 'Niedersachsen' },
  { code: 'NW', label: 'Nordrhein-Westfalen' },
  { code: 'RP', label: 'Rheinland-Pfalz' },
  { code: 'SL', label: 'Saarland' },
  { code: 'SN', label: 'Sachsen' },
  { code: 'ST', label: 'Sachsen-Anhalt' },
  { code: 'SH', label: 'Schleswig-Holstein' },
  { code: 'TH', label: 'Thüringen' }
];

function toISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Gauß'sche Osterformel - liefert den Ostersonntag eines Jahres (lokale
 * Zeitzone, keine UTC-Verschiebung). Alle beweglichen Feiertage
 * (Karfreitag, Ostermontag, Christi Himmelfahrt, Pfingstmontag,
 * Fronleichnam) leiten sich als fester Tagesabstand davon ab.
 */
export function computeEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=März, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/**
 * Alle gesetzlichen Feiertage eines Jahres für ein Bundesland, als Map von
 * ISO-Datum -> Name. Ohne `state` (noch nicht in den Einstellungen gewählt)
 * werden nur die neun bundesweit einheitlichen Feiertage geliefert - sicherer
 * Standard, der nirgends einen Feiertag fälschlich anzeigt.
 *
 * Bewusst vereinfacht: Mariä Himmelfahrt (BY) und Fronleichnam (SN/TH) gelten
 * dort eigentlich nur in Gemeinden mit überwiegend katholischer Bevölkerung,
 * nicht landesweit - eine Gemeinde-Datenbank wäre für dieses Feature
 * unverhältnismäßig, daher hier als "gilt im ganzen Bundesland" angenähert.
 * Der Buß- und Bettag (nur noch SN) wird bewusst ausgelassen (kein fester
 * Tagesabstand zu Ostern, eigene Berechnung nötig, sehr geringer Nutzen für
 * die restlichen 15 Bundesländer).
 */
export function getGermanHolidays(year: number, state?: Bundesland): Map<string, string> {
  const easter = computeEasterSunday(year);
  const holidays = new Map<string, string>();
  const add = (date: Date, name: string) => holidays.set(toISODate(date), name);

  // Bundesweit einheitlich.
  add(new Date(year, 0, 1), 'Neujahr');
  add(addDays(easter, -2), 'Karfreitag');
  add(addDays(easter, 1), 'Ostermontag');
  add(new Date(year, 4, 1), 'Tag der Arbeit');
  add(addDays(easter, 39), 'Christi Himmelfahrt');
  add(addDays(easter, 50), 'Pfingstmontag');
  add(new Date(year, 9, 3), 'Tag der Deutschen Einheit');
  add(new Date(year, 11, 25), '1. Weihnachtsfeiertag');
  add(new Date(year, 11, 26), '2. Weihnachtsfeiertag');

  if (!state) return holidays;

  if (state === 'BW' || state === 'BY' || state === 'ST') {
    add(new Date(year, 0, 6), 'Heilige Drei Könige');
  }
  if (state === 'BW' || state === 'BY' || state === 'HE' || state === 'NW' || state === 'RP' || state === 'SL') {
    add(addDays(easter, 60), 'Fronleichnam');
  }
  if (state === 'BY' || state === 'SL') {
    add(new Date(year, 7, 15), 'Mariä Himmelfahrt');
  }
  if (
    state === 'BB' ||
    state === 'MV' ||
    state === 'SN' ||
    state === 'ST' ||
    state === 'TH' ||
    state === 'HB' ||
    state === 'HH' ||
    state === 'NI' ||
    state === 'SH'
  ) {
    add(new Date(year, 9, 31), 'Reformationstag');
  }
  if (state === 'BW' || state === 'BY' || state === 'NW' || state === 'RP' || state === 'SL') {
    add(new Date(year, 10, 1), 'Allerheiligen');
  }

  return holidays;
}

/** Kurzform: ist `dateIso` ("YYYY-MM-DD") ein gesetzlicher Feiertag? */
export function isGermanHoliday(dateIso: string, state?: Bundesland): boolean {
  const year = Number(dateIso.slice(0, 4));
  if (!Number.isFinite(year)) return false;
  return getGermanHolidays(year, state).has(dateIso);
}
