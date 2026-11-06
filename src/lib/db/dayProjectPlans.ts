import { getDB } from './client';
import type { DayProjectPlan, ISODate } from './types';

/**
 * Legt die Tagesplanung für `date` an oder überschreibt eine bereits
 * vorhandene (das Datum ist der Primärschlüssel, siehe DayProjectPlan in
 * types.ts - daher ganz normaler Upsert per put(), keine Duplikat-Prüfung
 * nötig).
 */
export async function setDayProjectPlan(date: ISODate, projectNumber: string): Promise<DayProjectPlan> {
  const db = await getDB();
  const existing = await db.get('dayProjectPlans', date);
  const now = new Date().toISOString();
  const plan: DayProjectPlan = {
    date,
    projectNumber,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  await db.put('dayProjectPlans', plan);
  return plan;
}

export async function getDayProjectPlan(date: ISODate): Promise<DayProjectPlan | undefined> {
  const db = await getDB();
  return db.get('dayProjectPlans', date);
}

export async function removeDayProjectPlan(date: ISODate): Promise<void> {
  const db = await getDB();
  await db.delete('dayProjectPlans', date);
}

/**
 * Alle Tagesplanungen in [start, end] (inklusive) - nutzt den Primärschlüssel
 * direkt als Bereichsabfrage, da `date` das keyPath des Stores ist. Sortiert
 * automatisch aufsteigend nach Datum (IndexedDB-Cursor-Reihenfolge über den
 * Schlüssel).
 */
export async function listDayProjectPlansInRange(start: ISODate, end: ISODate): Promise<DayProjectPlan[]> {
  const db = await getDB();
  return db.getAll('dayProjectPlans', IDBKeyRange.bound(start, end));
}

/** Alle jemals erfassten Tagesplanungen, aufsteigend nach Datum. */
export async function listAllDayProjectPlans(): Promise<DayProjectPlan[]> {
  const db = await getDB();
  return db.getAll('dayProjectPlans');
}
