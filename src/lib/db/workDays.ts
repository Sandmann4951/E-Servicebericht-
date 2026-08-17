import { getDB } from './client';
import { nowHHmm, todayISODate } from '../utils/date';
import type { ID, WorkDay } from './types';

/**
 * Der aktuell laufende Tagesstempel (eingestempelt, noch nicht ausgestempelt).
 * Es sollte höchstens einen geben; falls doch mehrere existieren, wird der
 * zuletzt begonnene zurückgegeben. Bewusst ungeschützt/low-level - die
 * "schon eingestempelt?"-Prüfung liegt in der Action-Schicht
 * (src/lib/clockActions.ts), analog zu addTimeEntry()/clockInToReport() vorher.
 */
export async function getActiveWorkDay(): Promise<WorkDay | undefined> {
  const db = await getDB();
  const all = await db.getAll('workDays');
  return all
    .filter((day) => day.checkInTime && !day.checkOutTime)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.checkInTime ?? '').localeCompare(b.checkInTime ?? ''))
    .at(-1);
}

export async function getWorkDay(id: ID): Promise<WorkDay | undefined> {
  const db = await getDB();
  return db.get('workDays', id);
}

/** Legt einen neuen Tagesstempel an. Keine Prüfung, ob bereits einer aktiv ist - siehe getActiveWorkDay(). */
export async function checkInWorkDay(): Promise<WorkDay> {
  const db = await getDB();
  const now = new Date().toISOString();
  const day: WorkDay = {
    id: crypto.randomUUID(),
    date: todayISODate(),
    checkInTime: nowHHmm(),
    createdAt: now,
    updatedAt: now
  };
  await db.put('workDays', day);
  return day;
}

/**
 * Beendet einen Tagesstempel (setzt checkOutTime). Read-mutate-write in einer
 * Transaktion, analog withReportTransaction(). `checkOutTime` ist optional
 * und fällt standardmäßig auf "jetzt" zurück - explizit übergeben wird sie
 * nur beim automatischen Ausstempeln wegen Überschreitung der gesetzlichen
 * Höchstarbeitszeit (siehe clockActions.autoCheckOutIfExceeded()), das
 * bewusst auf Einstempelzeit + Höchstarbeitszeit kappt statt auf den
 * tatsächlichen (ggf. viel späteren) Erkennungszeitpunkt.
 */
export async function checkOutWorkDay(id: ID, checkOutTime: string = nowHHmm()): Promise<WorkDay | undefined> {
  const db = await getDB();
  const tx = db.transaction('workDays', 'readwrite');
  const store = tx.objectStore('workDays');
  const day = await store.get(id);
  if (!day) {
    await tx.done;
    return undefined;
  }
  day.checkOutTime = checkOutTime;
  day.updatedAt = new Date().toISOString();
  await store.put(day);
  await tx.done;
  return day;
}
