import { getDB } from './client';
import type { ID, ReportStatus, ServiceReport } from './types';

export interface CreateReportInput {
  projectNumber: string;
  projectDescription?: string;
  customer?: string;
  contactPerson?: string;
  technicianName?: string;
  notes?: string;
}

export async function createReport(input: CreateReportInput): Promise<ServiceReport> {
  const db = await getDB();
  const now = new Date().toISOString();
  const report: ServiceReport = {
    id: crypto.randomUUID(),
    projectNumber: input.projectNumber.trim(),
    projectDescription: input.projectDescription?.trim() || undefined,
    customer: input.customer?.trim() || undefined,
    contactPerson: input.contactPerson?.trim() || undefined,
    technicianName: input.technicianName?.trim() || undefined,
    status: 'open',
    notes: input.notes?.trim() || undefined,
    timeEntryCount: 0,
    totalDurationMinutes: 0,
    materialItemCount: 0,
    photoCount: 0,
    createdAt: now,
    updatedAt: now
  };
  await db.put('reports', report);
  return report;
}

export async function getReport(id: ID): Promise<ServiceReport | undefined> {
  const db = await getDB();
  return db.get('reports', id);
}

// 'signed' ist kein eigener ReportStatus (unterschriebene Berichte sind in
// den Daten immer zusätzlich 'completed', siehe automatische Statusänderung
// beim Unterschreiben) - als Filter aber eine eigene, genauere Sicht auf
// denselben Zustand.
export type ReportFilter = 'all' | ReportStatus | 'signed';

/** Liste aller Berichte, neueste Änderung zuerst. */
export async function listReports(filter: ReportFilter = 'all'): Promise<ServiceReport[]> {
  const db = await getDB();
  const all =
    filter === 'all' || filter === 'signed' ? await db.getAll('reports') : await db.getAllFromIndex('reports', 'status', filter);
  const filtered = filter === 'signed' ? all.filter((report) => !!report.signedAt) : all;
  return filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Liest einen Bericht, lässt ihn per `mutate` verändern und schreibt ihn
 * zurück - alles in EINER Transaktion statt über die db.get()/db.put()-
 * Shorthands (die jeweils eine eigene, sofort abgeschlossene Transaktion
 * öffnen): IndexedDB serialisiert automatisch Transaktionen mit
 * überlappendem Scope im readwrite-Modus - das schützt vor einem verlorenen
 * Update, wenn parallel z.B. recomputeReportSummary() (ausgelöst durchs
 * Hinzufügen einer Zeit/Material/Foto) denselben Report-Datensatz liest und
 * schreibt. Von updateReport() und der Unterschriften-Erfassung genutzt.
 */
async function withReportTransaction(
  id: ID,
  mutate: (report: ServiceReport) => void
): Promise<ServiceReport | undefined> {
  const db = await getDB();
  const tx = db.transaction('reports', 'readwrite');
  const store = tx.objectStore('reports');
  const report = await store.get(id);
  if (!report) {
    await tx.done;
    return undefined;
  }
  mutate(report);
  await store.put(report);
  await tx.done;
  return report;
}

export type UpdateReportPatch = Partial<
  Pick<
    ServiceReport,
    'projectNumber' | 'projectDescription' | 'customer' | 'contactPerson' | 'technicianName' | 'status' | 'notes'
  >
>;

export async function updateReport(id: ID, patch: UpdateReportPatch): Promise<ServiceReport | undefined> {
  return withReportTransaction(id, (report) => {
    if (patch.projectNumber !== undefined) report.projectNumber = patch.projectNumber.trim();
    if (patch.projectDescription !== undefined) report.projectDescription = patch.projectDescription.trim() || undefined;
    if (patch.customer !== undefined) report.customer = patch.customer.trim() || undefined;
    if (patch.contactPerson !== undefined) report.contactPerson = patch.contactPerson.trim() || undefined;
    if (patch.technicianName !== undefined) report.technicianName = patch.technicianName.trim() || undefined;
    if (patch.status !== undefined) report.status = patch.status;
    if (patch.notes !== undefined) report.notes = patch.notes.trim() || undefined;
    report.updatedAt = new Date().toISOString();
  });
}

export interface SetReportSignatureInput {
  blob: Blob;
  width: number;
  height: number;
  signedByName?: string;
}

/** Speichert (oder ersetzt) die Kunden-Unterschrift eines Berichts. */
export async function setReportSignature(id: ID, input: SetReportSignatureInput): Promise<ServiceReport | undefined> {
  return withReportTransaction(id, (report) => {
    const now = new Date().toISOString();
    report.signatureBlob = input.blob;
    report.signatureWidth = input.width;
    report.signatureHeight = input.height;
    report.signedByName = input.signedByName?.trim() || undefined;
    report.signedAt = now;
    report.updatedAt = now;
  });
}

/** Entfernt eine gespeicherte Kunden-Unterschrift wieder. */
export async function clearReportSignature(id: ID): Promise<ServiceReport | undefined> {
  return withReportTransaction(id, (report) => {
    report.signatureBlob = undefined;
    report.signatureWidth = undefined;
    report.signatureHeight = undefined;
    report.signedByName = undefined;
    report.signedAt = undefined;
    report.updatedAt = new Date().toISOString();
  });
}

/** Löscht einen Bericht sowie alle zugehörigen Zeiten/Material/Fotos atomar. */
export async function deleteReport(id: ID): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['reports', 'timeEntries', 'materialItems', 'photos'], 'readwrite');

  const deleteAllByReportId = async (storeName: 'timeEntries' | 'materialItems' | 'photos') => {
    const store = tx.objectStore(storeName);
    let cursor = await store.index('reportId').openCursor(id);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
  };

  await Promise.all([
    deleteAllByReportId('timeEntries'),
    deleteAllByReportId('materialItems'),
    deleteAllByReportId('photos'),
    tx.objectStore('reports').delete(id)
  ]);

  await tx.done;
}
