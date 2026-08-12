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
