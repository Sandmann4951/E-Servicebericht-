import type { Bundesland } from './utils/holidays';

// Kein eigener Login/Mehrbenutzer-Verwaltung - aber der Name des Monteurs
// wiederholt sich bei jedem Bericht, den er selbst anlegt. Statt ihn jedes
// Mal neu eintippen zu müssen, wird der zuletzt verwendete Techniker-Name
// lokal auf dem Gerät gemerkt und bei neuen Berichten automatisch
// vorausgefüllt (bleibt jederzeit überschreibbar, z.B. wenn ein Kollege das
// Gerät benutzt).
const TECHNICIAN_NAME_KEY = 'e-servicebericht:technicianName';

export function getTechnicianName(): string {
  try {
    return localStorage.getItem(TECHNICIAN_NAME_KEY) ?? '';
  } catch {
    // localStorage evtl. nicht verfügbar (z.B. Safari Private Mode) - dann
    // bleibt das Feld eben leer, kein harter Fehler.
    return '';
  }
}

export function setTechnicianName(name: string): void {
  try {
    const trimmed = name.trim();
    if (trimmed) {
      localStorage.setItem(TECHNICIAN_NAME_KEY, trimmed);
    } else {
      localStorage.removeItem(TECHNICIAN_NAME_KEY);
    }
  } catch {
    // s.o.
  }
}

// Sollstunden pro Woche - Grundlage für den Soll-/Ist-Stunden-Vergleich in
// der Monats-Statistik (getMonthTarget() in stats.ts). 40h (klassische
// Vollzeit) als Standard, damit der Vergleich auch ohne vorherige
// Konfiguration in den Einstellungen ein sinnvolles Ergebnis zeigt.
const WEEKLY_TARGET_HOURS_KEY = 'e-servicebericht:weeklyTargetHours';
const DEFAULT_WEEKLY_TARGET_HOURS = 40;

export function getWeeklyTargetHours(): number {
  try {
    const raw = localStorage.getItem(WEEKLY_TARGET_HOURS_KEY);
    if (raw === null) return DEFAULT_WEEKLY_TARGET_HOURS;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_WEEKLY_TARGET_HOURS;
  } catch {
    return DEFAULT_WEEKLY_TARGET_HOURS;
  }
}

export function setWeeklyTargetHours(hours: number): void {
  try {
    if (Number.isFinite(hours) && hours >= 0) {
      localStorage.setItem(WEEKLY_TARGET_HOURS_KEY, String(hours));
    } else {
      localStorage.removeItem(WEEKLY_TARGET_HOURS_KEY);
    }
  } catch {
    // s.o.
  }
}

// Bundesland - für die korrekte Berücksichtigung landesspezifischer
// Feiertage (siehe utils/holidays.ts) im Soll-/Ist-Stunden-Vergleich.
// Bewusst OHNE Standardwert: ein falsch geratenes Bundesland würde
// Feiertage anzeigen, die dort gar nicht gelten - lieber vorerst nur die
// neun bundesweiten Feiertage (Fallback in getGermanHolidays() ohne
// `state`), bis der Nutzer sein Bundesland bewusst auswählt.
const BUNDESLAND_KEY = 'e-servicebericht:bundesland';
const VALID_BUNDESLAENDER = new Set([
  'BW',
  'BY',
  'BE',
  'BB',
  'HB',
  'HH',
  'HE',
  'MV',
  'NI',
  'NW',
  'RP',
  'SL',
  'SN',
  'ST',
  'SH',
  'TH'
]);

export function getBundesland(): Bundesland | undefined {
  try {
    const raw = localStorage.getItem(BUNDESLAND_KEY);
    return raw && VALID_BUNDESLAENDER.has(raw) ? (raw as Bundesland) : undefined;
  } catch {
    return undefined;
  }
}

export function setBundesland(state: Bundesland | undefined): void {
  try {
    if (state && VALID_BUNDESLAENDER.has(state)) {
      localStorage.setItem(BUNDESLAND_KEY, state);
    } else {
      localStorage.removeItem(BUNDESLAND_KEY);
    }
  } catch {
    // s.o.
  }
}
