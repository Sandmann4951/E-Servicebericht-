import { getDB } from './client';
import { recomputeReportSummary } from './summary';
import { computeDurationMinutes, parseTimeToMinutes } from '../utils/date';
import type { ID, TimeEntry } from './types';

const ALL_STORES = ['timeEntries', 'materialItems', 'photos', 'reports'] as const;

export interface TimeEntryInput {
  date: string;
  startTime?: string;
  endTime?: string;
  /** Nur relevant, wenn startTime/endTime nicht beide gesetzt sind (manuelle Dauer). */
  durationMinutes?: number;
  note?: string;
  /** Nur von der Tagesstempeluhr gesetzt (checkInDay/switchToProject/switchToIdle), nie bei manuellen Einträgen. */
  workDayId?: ID;
}

/**
 * Ermittelt die endgültige Dauer: Wenn Start- UND Endzeit vorhanden und
 * gültig sind, hat die berechnete Dauer immer Vorrang (verhindert, dass ein
 * alter durationMinutes-Wert nach Bearbeiten der Uhrzeiten stehen bleibt).
 * Andernfalls wird ein manuell gesetzter durationMinutes-Wert übernommen.
 */
function resolveDuration(entry: Pick<TimeEntry, 'startTime' | 'endTime' | 'durationMinutes'>): number | undefined {
  if (entry.startTime && entry.endTime) {
    const computed = computeDurationMinutes(entry.startTime, entry.endTime);
    if (computed !== undefined) return computed;
  }
  return entry.durationMinutes;
}

/** Zeiteinträge eines Berichts, sortiert nach Datum (und Startzeit). */
export async function listTimeEntries(reportId: ID): Promise<TimeEntry[]> {
  const db = await getDB();
  const entries = await db.getAllFromIndex('timeEntries', 'reportId', reportId);
  return entries.sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''));
}

/** Alle Zeiteinträge (Projekt- und Leerlaufzeit-Abschnitte) eines Tagesstempels, sortiert nach Startzeit. */
export async function listTimeEntriesForWorkDay(workDayId: ID): Promise<TimeEntry[]> {
  const db = await getDB();
  const entries = await db.getAllFromIndex('timeEntries', 'workDayId', workDayId);
  return entries.sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
}

/**
 * Alle über die Tagesstempeluhr entstandenen Zeiteinträge (workDayId gesetzt)
 * eines Kalendertages, sortiert nach Startzeit - bewusst NICHT auf einen
 * einzelnen Tagesstempel (WorkDay) beschränkt: wird am selben Tag
 * aus- und wieder eingestempelt, entsteht dabei ein weiterer WorkDay-
 * Datensatz mit demselben `date`, dessen Einträge hier trotzdem mitzählen -
 * die Tagesbilanz (checkOutDay()/"Heute bisher" in DayClock.svelte) soll
 * erst mit dem nächsten Kalendertag wieder bei 0 anfangen, nicht bei jedem
 * erneuten Einstempeln am selben Tag.
 */
export async function listTimeEntriesForDate(date: string): Promise<TimeEntry[]> {
  const db = await getDB();
  const entries = await db.getAllFromIndex('timeEntries', 'date', date);
  return entries.filter((entry) => entry.workDayId !== undefined).sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
}

/**
 * Alle abgeschlossenen (mit endTime), noch keinem Projekt zugeordneten
 * Leerlaufzeit-Einträge - für die nachträgliche Zuordnung. Die aktuell noch
 * laufende Leerlaufzeit (falls vorhanden) wird bewusst ausgeschlossen, da sie
 * über die normale Ein-/Auscheck-Logik behandelt wird, nicht über eine
 * nachträgliche Zuordnung.
 */
export async function listUnassignedIdleEntries(): Promise<TimeEntry[]> {
  const db = await getDB();
  const all = await db.getAll('timeEntries');
  return all
    .filter((entry) => !entry.reportId && entry.endTime)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.startTime ?? '').localeCompare(a.startTime ?? ''));
}

/**
 * Der aktuell "laufende" Zeiteintrag eines Berichts fürs Ein-/Auschecken -
 * also ein Eintrag mit gesetzter Startzeit, aber noch ohne Endzeit. Es sollte
 * normalerweise höchstens einen geben; falls doch mehrere existieren (z.B.
 * durch manuelle Bearbeitung), wird der zuletzt begonnene zurückgegeben.
 */
export async function getActiveTimeEntry(reportId: ID): Promise<TimeEntry | undefined> {
  const entries = await listTimeEntries(reportId);
  const open = entries.filter((entry) => entry.startTime && !entry.endTime);
  return open.at(-1);
}

/**
 * Der aktuell laufende Zeiteintrag über ALLE Berichte (und Leerlaufzeit)
 * hinweg - damit lässt sich verhindern, dass man gleichzeitig in mehreren
 * Berichten eingecheckt ist. `reportId === undefined` bedeutet, dass
 * gerade Leerlaufzeit läuft. Es sollte höchstens einen geben; falls doch
 * mehrere existieren, wird der zuletzt begonnene zurückgegeben.
 */
export async function getGloballyActiveTimeEntry(): Promise<TimeEntry | undefined> {
  const db = await getDB();
  const all = await db.getAll('timeEntries');
  const open = all
    .filter((entry) => entry.startTime && !entry.endTime)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  return open.at(-1);
}

/**
 * Findet Zeiteinträge (berichtsübergreifend, am selben Tag - schließt auch
 * Leerlaufzeit-Einträge mit ein), deren Zeitspanne sich mit
 * [startTime, endTime) überschneidet - Plausibilitätsprüfung fürs
 * nachträgliche manuelle Anpassen von Zeiten, da man ja nicht gleichzeitig an
 * zwei Orten arbeiten kann. Einträge ohne beide Zeiten (z.B. eine laufende
 * Stempel-Session oder ein reiner Dauer-Eintrag) werden ignoriert, da für sie
 * keine vergleichbare Zeitspanne existiert. Direkt aneinandergrenzende
 * Zeiten (Ende = Start des nächsten) gelten NICHT als Überschneidung.
 */
export async function findOverlappingTimeEntries(
  date: string,
  startTime: string,
  endTime: string,
  excludeEntryId?: ID
): Promise<TimeEntry[]> {
  const startMin = parseTimeToMinutes(startTime);
  const endMin = parseTimeToMinutes(endTime);
  if (startMin === undefined || endMin === undefined) return [];

  const db = await getDB();
  const sameDate = await db.getAllFromIndex('timeEntries', 'date', date);
  return sameDate.filter((entry) => {
    if (entry.id === excludeEntryId) return false;
    if (!entry.startTime || !entry.endTime) return false;
    const otherStart = parseTimeToMinutes(entry.startTime);
    const otherEnd = parseTimeToMinutes(entry.endTime);
    if (otherStart === undefined || otherEnd === undefined) return false;
    return startMin < otherEnd && otherStart < endMin;
  });
}

/**
 * `reportId` ist optional: `undefined` legt einen Leerlaufzeit-Eintrag an
 * (eingestempelt, aber keinem Projekt zugeordnet) - dann wird auch keine
 * Report-Summary neu berechnet, da der Eintrag zu keinem Bericht gehört.
 */
export async function addTimeEntry(reportId: ID | undefined, input: TimeEntryInput): Promise<TimeEntry> {
  const db = await getDB();
  const now = new Date().toISOString();
  const entry: TimeEntry = {
    id: crypto.randomUUID(),
    reportId,
    workDayId: input.workDayId,
    date: input.date,
    startTime: input.startTime || undefined,
    endTime: input.endTime || undefined,
    durationMinutes: input.durationMinutes,
    note: input.note?.trim() || undefined,
    createdAt: now,
    updatedAt: now
  };
  entry.durationMinutes = resolveDuration(entry);

  const tx = db.transaction(ALL_STORES, 'readwrite');
  await tx.objectStore('timeEntries').put(entry);
  if (reportId) await recomputeReportSummary(tx, reportId, now);
  await tx.done;
  return entry;
}

export async function updateTimeEntry(
  id: ID,
  patch: Partial<TimeEntryInput> & { reportId?: ID }
): Promise<TimeEntry | undefined> {
  const db = await getDB();
  const tx = db.transaction(ALL_STORES, 'readwrite');
  const store = tx.objectStore('timeEntries');
  const entry = await store.get(id);
  if (!entry) {
    await tx.done;
    return undefined;
  }

  const previousReportId = entry.reportId;
  const merged: TimeEntry = {
    ...entry,
    ...patch,
    note: patch.note !== undefined ? patch.note.trim() || undefined : entry.note,
    updatedAt: new Date().toISOString()
  };
  merged.durationMinutes = resolveDuration(merged);

  await store.put(merged);
  // Ändert sich die reportId (z.B. beim nachträglichen Zuordnen eines
  // Leerlaufzeit-Eintrags zu einem Projekt), müssen sowohl der alte als auch
  // der neue Bericht ihre Summary neu berechnen - beide können undefined
  // sein (Leerlaufzeit), dann entfällt der jeweilige Aufruf.
  if (previousReportId && previousReportId !== merged.reportId) {
    await recomputeReportSummary(tx, previousReportId, merged.updatedAt);
  }
  if (merged.reportId) {
    await recomputeReportSummary(tx, merged.reportId, merged.updatedAt);
  }
  await tx.done;
  return merged;
}

export async function deleteTimeEntry(id: ID): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(ALL_STORES, 'readwrite');
  const store = tx.objectStore('timeEntries');
  const entry = await store.get(id);
  if (!entry) {
    await tx.done;
    return;
  }
  await store.delete(id);
  if (entry.reportId) await recomputeReportSummary(tx, entry.reportId);
  await tx.done;
}
