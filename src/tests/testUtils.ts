import { DB_NAME } from '../lib/db/types';
import { resetDBConnectionForTests } from '../lib/db/client';

/** Setzt die Test-Datenbank vor jedem Test komplett zurück. */
export async function resetTestDB(): Promise<void> {
  await resetDBConnectionForTests();
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}
