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

export type ReportFilter = 'all' | ReportStatus;

/** Liste aller Berichte, neueste Änderung zuerst. */
export async function listReports(filter: ReportFilter = 'all'): Promise<ServiceReport[]> {
  const db = await getDB();
  const all = filter === 'all' ? await db.getAll('reports') : await db.getAllFromIndex('reports', 'status', filter);
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export type UpdateReportPatch = Partial<
  Pick<
    ServiceReport,
    'projectNumber' | 'projectDescription' | 'customer' | 'contactPerson' | 'technicianName' | 'status' | 'notes'
  >
>;

export async function updateReport(id: ID, patch: UpdateReportPatch): Promise<ServiceReport | undefined> {
  const db = await getDB();
  // Lesen und Schreiben bewusst in EINER Transaktion statt über die
  // db.get()/db.put()-Shorthands (die jeweils eine eigene, sofort
  // abgeschlossene Transaktion öffnen): IndexedDB serialisiert automatisch
  // Transaktionen mit überlappendem Scope im readwrite-Modus - das schützt
  // hier vor einem verlorenen Update, wenn parallel z.B. recomputeReportSummary()
  // (ausgelöst durchs Hinzufügen einer Zeit/Material/Foto) denselben
  // Report-Datensatz liest und schreibt.
  const tx = db.transaction('reports', 'readwrite');
  const store = tx.objectStore('reports');
  const report = await store.get(id);
  if (!report) {
    await tx.done;
    return undefined;
  }

  if (patch.projectNumber !== undefined) report.projectNumber = patch.projectNumber.trim();
  if (patch.projectDescription !== undefined) report.projectDescription = patch.projectDescription.trim() || undefined;
  if (patch.customer !== undefined) report.customer = patch.customer.trim() || undefined;
  if (patch.contactPerson !== undefined) report.contactPerson = patch.contactPerson.trim() || undefined;
  if (patch.technicianName !== undefined) report.technicianName = patch.technicianName.trim() || undefined;
  if (patch.status !== undefined) report.status = patch.status;
  if (patch.notes !== undefined) report.notes = patch.notes.trim() || undefined;
  report.updatedAt = new Date().toISOString();

  await store.put(report);
  await tx.done;
  return report;
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
