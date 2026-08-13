import { openDB, type IDBPDatabase } from 'idb';
import { DB_NAME, DB_VERSION, type ServiceBerichtDB } from './types';
import { computeDurationMinutes } from '../utils/date';

let dbPromise: Promise<IDBPDatabase<ServiceBerichtDB>> | undefined;

/**
 * Öffnet (und initialisiert bei Bedarf) die App-Datenbank. Wird lazy beim
 * ersten Zugriff aufgerufen und danach als Singleton wiederverwendet.
 */
export function getDB(): Promise<IDBPDatabase<ServiceBerichtDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ServiceBerichtDB>(DB_NAME, DB_VERSION, {
      // `oldVersion`-gegated, damit bestehende Nutzer-Datenbanken (aktuell
      // v1) sauber hochgezogen werden, statt beim Anlegen bereits
      // existierender Stores zu scheitern oder Daten zu verlieren.
      async upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          const reports = db.createObjectStore('reports', { keyPath: 'id' });
          reports.createIndex('projectNumber', 'projectNumber');
          reports.createIndex('status', 'status');
          reports.createIndex('updatedAt', 'updatedAt');

          const timeEntries = db.createObjectStore('timeEntries', { keyPath: 'id' });
          timeEntries.createIndex('reportId', 'reportId');
          timeEntries.createIndex('date', 'date');

          const materialItems = db.createObjectStore('materialItems', { keyPath: 'id' });
          materialItems.createIndex('reportId', 'reportId');

          const photos = db.createObjectStore('photos', { keyPath: 'id' });
          photos.createIndex('reportId', 'reportId');
        }
        if (oldVersion < 2) {
          // Tagesstempeluhr: neuer Store für den Tagesstempel + Index, um
          // alle Zeiteinträge (Projekt- und Leerlaufzeit-Abschnitte) eines
          // Tages abzufragen. Ein Index auf einem bereits existierenden
          // Store lässt sich nur über die Upgrade-`transaction` anlegen,
          // nicht über db.createObjectStore().
          const workDays = db.createObjectStore('workDays', { keyPath: 'id' });
          workDays.createIndex('date', 'date');

          transaction.objectStore('timeEntries').createIndex('workDayId', 'workDayId');
        }
        if (oldVersion < 3) {
          // Bugfix: Zeitspannen über Mitternacht (Endzeit vor Startzeit, z.B.
          // über Nacht vergessenes Auschecken) wurden bisher als ungültig
          // verworfen (durationMinutes blieb undefined) statt korrekt als
          // "geht über Mitternacht" (+24h) berechnet zu werden - siehe
          // computeDurationMinutes() in utils/date.ts. Bereits gespeicherte
          // Einträge werden hier einmalig mit der korrigierten Logik neu
          // berechnet, betroffene Report-Summen (totalDurationMinutes)
          // entsprechend nachgezogen.
          const entriesStore = transaction.objectStore('timeEntries');
          const reportsStore = transaction.objectStore('reports');
          const affectedReportIds = new Set<string>();

          let cursor = await entriesStore.openCursor();
          while (cursor) {
            const entry = cursor.value;
            if (entry.startTime && entry.endTime) {
              const recomputed = computeDurationMinutes(entry.startTime, entry.endTime);
              if (recomputed !== entry.durationMinutes) {
                await cursor.update({ ...entry, durationMinutes: recomputed });
                if (entry.reportId) affectedReportIds.add(entry.reportId);
              }
            }
            cursor = await cursor.continue();
          }

          for (const reportId of affectedReportIds) {
            const report = await reportsStore.get(reportId);
            if (!report) continue;
            const entries = await entriesStore.index('reportId').getAll(reportId);
            report.totalDurationMinutes = entries.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
            await reportsStore.put(report);
          }
        }
        if (oldVersion < 4) {
          // Abwesenheiten (Urlaub/Krank/Zeitausgleich): eigener Store, dessen
          // Primärschlüssel direkt das Datum ist (kein separater Index nötig -
          // Bereichsabfragen für Monats-/Jahresansichten laufen einfach über
          // den Primärschlüssel-Bereich).
          db.createObjectStore('absences', { keyPath: 'date' });
        }
      }
    });
  }
  return dbPromise;
}

/**
 * Nur für Tests: schließt eine offene Verbindung und erzwingt, dass beim
 * nächsten getDB() neu geöffnet wird. Das explizite `close()` ist nötig,
 * damit ein anschließendes `indexedDB.deleteDatabase()` nicht durch die
 * noch offene Verbindung blockiert wird.
 */
export async function resetDBConnectionForTests(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
  }
  dbPromise = undefined;
}

/**
 * Bittet den Browser, den Origin-Speicher als "persistent" zu markieren,
 * damit iOS Safari die IndexedDB-Daten (insbesondere Fotos) unter
 * Speicherdruck nicht automatisch räumt. Best-effort, Ergebnis wird nicht
 * erzwungen - viele Browser gewähren es ohnehin erst nach Nutzung/Install.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return false;
  }
  try {
    const alreadyPersisted = await navigator.storage.persisted?.();
    if (alreadyPersisted) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
