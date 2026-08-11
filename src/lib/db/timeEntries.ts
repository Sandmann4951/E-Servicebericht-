import { getDB } from './client';
import { recomputeReportSummary } from './summary';
import { computeDurationMinutes } from '../utils/date';
import type { ID, TimeEntry } from './types';

const ALL_STORES = ['timeEntries', 'materialItems', 'photos', 'reports'] as const;

export interface TimeEntryInput {
  date: string;
  startTime?: string;
  endTime?: string;
  /** Nur relevant, wenn startTime/endTime nicht beide gesetzt sind (manuelle Dauer). */
  durationMinutes?: number;
  note?: string;
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

/**
 * Der aktuell "laufende" Zeiteintrag eines Berichts fürs Ein-/Ausstempeln -
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
 * Der aktuell laufende Zeiteintrag über ALLE Berichte hinweg (unabhängig
 * davon, in welchem Bericht man sich gerade befindet) - damit lässt sich
 * verhindern, dass man gleichzeitig in mehreren Berichten eingestempelt ist.
 * Es sollte höchstens einen geben; falls doch mehrere existieren, wird der
 * zuletzt begonnene zurückgegeben.
 */
export async function getGloballyActiveTimeEntry(): Promise<TimeEntry | undefined> {
  const db = await getDB();
  const all = await db.getAll('timeEntries');
  const open = all
    .filter((entry) => entry.startTime && !entry.endTime)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  return open.at(-1);
}

export async function addTimeEntry(reportId: ID, input: TimeEntryInput): Promise<TimeEntry> {
  const db = await getDB();
  const now = new Date().toISOString();
  const entry: TimeEntry = {
    id: crypto.randomUUID(),
    reportId,
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
  await recomputeReportSummary(tx, reportId, now);
  await tx.done;
  return entry;
}

export async function updateTimeEntry(id: ID, patch: Partial<TimeEntryInput>): Promise<TimeEntry | undefined> {
  const db = await getDB();
  const tx = db.transaction(ALL_STORES, 'readwrite');
  const store = tx.objectStore('timeEntries');
  const entry = await store.get(id);
  if (!entry) {
    await tx.done;
    return undefined;
  }

  const merged: TimeEntry = {
    ...entry,
    ...patch,
    note: patch.note !== undefined ? patch.note.trim() || undefined : entry.note,
    updatedAt: new Date().toISOString()
  };
  merged.durationMinutes = resolveDuration(merged);

  await store.put(merged);
  await recomputeReportSummary(tx, entry.reportId, merged.updatedAt);
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
  await recomputeReportSummary(tx, entry.reportId);
  await tx.done;
}
