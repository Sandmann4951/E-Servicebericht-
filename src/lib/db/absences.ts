import { getDB } from './client';
import type { Absence, AbsenceType, ISODate } from './types';

/**
 * Legt eine Abwesenheit für `date` an oder überschreibt eine bereits
 * vorhandene (das Datum ist der Primärschlüssel, siehe Absence in types.ts -
 * daher ganz normaler Upsert per put(), keine Duplikat-Prüfung nötig).
 */
export async function setAbsence(date: ISODate, type: AbsenceType, note?: string): Promise<Absence> {
  const db = await getDB();
  const existing = await db.get('absences', date);
  const now = new Date().toISOString();
  const absence: Absence = {
    date,
    type,
    note: note?.trim() || undefined,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  await db.put('absences', absence);
  return absence;
}

export async function getAbsence(date: ISODate): Promise<Absence | undefined> {
  const db = await getDB();
  return db.get('absences', date);
}

export async function removeAbsence(date: ISODate): Promise<void> {
  const db = await getDB();
  await db.delete('absences', date);
}

/**
 * Alle Abwesenheiten in [start, end] (inklusive) - nutzt den Primärschlüssel
 * direkt als Bereichsabfrage, da `date` das keyPath des Stores ist. Sortiert
 * automatisch aufsteigend nach Datum (IndexedDB-Cursor-Reihenfolge über den
 * Schlüssel).
 */
export async function listAbsencesInRange(start: ISODate, end: ISODate): Promise<Absence[]> {
  const db = await getDB();
  return db.getAll('absences', IDBKeyRange.bound(start, end));
}

/** Alle jemals erfassten Abwesenheiten, aufsteigend nach Datum. */
export async function listAllAbsences(): Promise<Absence[]> {
  const db = await getDB();
  return db.getAll('absences');
}
