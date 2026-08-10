import { getDB } from './client';
import type { ID, ReportStatus, ServiceReport } from './types';

export interface CreateReportInput {
  projectNumber: string;
  customer?: string;
  technicianName?: string;
}

export async function createReport(input: CreateReportInput): Promise<ServiceReport> {
  const db = await getDB();
  const now = new Date().toISOString();
  const report: ServiceReport = {
    id: crypto.randomUUID(),
    projectNumber: input.projectNumber.trim(),
    customer: input.customer?.trim() || undefined,
    technicianName: input.technicianName?.trim() || undefined,
    status: 'open',
    notes: undefined,
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
  Pick<ServiceReport, 'projectNumber' | 'customer' | 'technicianName' | 'status' | 'notes'>
>;

export async function updateReport(id: ID, patch: UpdateReportPatch): Promise<ServiceReport | undefined> {
  const db = await getDB();
  const report = await db.get('reports', id);
  if (!report) return undefined;

  if (patch.projectNumber !== undefined) report.projectNumber = patch.projectNumber.trim();
  if (patch.customer !== undefined) report.customer = patch.customer.trim() || undefined;
  if (patch.technicianName !== undefined) report.technicianName = patch.technicianName.trim() || undefined;
  if (patch.status !== undefined) report.status = patch.status;
  if (patch.notes !== undefined) report.notes = patch.notes.trim() || undefined;
  report.updatedAt = new Date().toISOString();

  await db.put('reports', report);
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
