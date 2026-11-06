import { getDB } from './client';
import type { DayProjectPlan, ID, ISODate } from './types';

/**
 * Legt eine neue Tagesplanung an - mehrere Projekte pro Tag sind möglich
 * (siehe DayProjectPlan in types.ts), deshalb kein Upsert mehr wie zuvor.
 * Dieselbe Projektnummer wird für denselben Tag nicht doppelt angelegt
 * (erneuter Aufruf mit identischer Kombination liefert den bestehenden
 * Eintrag unverändert zurück statt eines Duplikats).
 */
export async function addDayProjectPlan(date: ISODate, projectNumber: string): Promise<DayProjectPlan> {
  const db = await getDB();
  const existing = (await db.getAllFromIndex('dayProjectPlans', 'date', date)).find(
    (plan) => plan.projectNumber === projectNumber
  );
  if (existing) return existing;

  const now = new Date().toISOString();
  const plan: DayProjectPlan = {
    id: crypto.randomUUID(),
    date,
    projectNumber,
    createdAt: now,
    updatedAt: now
  };
  await db.put('dayProjectPlans', plan);
  return plan;
}

export async function removeDayProjectPlan(id: ID): Promise<void> {
  const db = await getDB();
  await db.delete('dayProjectPlans', id);
}

/** Alle für `date` geplanten Projekte, aufsteigend nach Anlagezeitpunkt (zuerst hinzugefügt = zuerst in der Liste). */
export async function listDayProjectPlansForDate(date: ISODate): Promise<DayProjectPlan[]> {
  const db = await getDB();
  const plans = await db.getAllFromIndex('dayProjectPlans', 'date', date);
  return plans.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Alle Tagesplanungen in [start, end] (inklusive), über den `date`-Index. */
export async function listDayProjectPlansInRange(start: ISODate, end: ISODate): Promise<DayProjectPlan[]> {
  const db = await getDB();
  return db.getAllFromIndex('dayProjectPlans', 'date', IDBKeyRange.bound(start, end));
}

/** Alle jemals erfassten Tagesplanungen, unabhängig vom Datum. */
export async function listAllDayProjectPlans(): Promise<DayProjectPlan[]> {
  const db = await getDB();
  return db.getAll('dayProjectPlans');
}
