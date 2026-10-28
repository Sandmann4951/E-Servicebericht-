import { getDB } from './client';
import type { ID, OrderType, PlantStatus, ReportStatus, ServiceReport } from './types';

export interface CreateReportInput {
  projectNumber: string;
  projectDescription?: string;
  customer?: string;
  contactPerson?: string;
  contactPhone?: string;
  technicianName?: string;
  notes?: string;
  performedWork?: string;
  plannedLaborHours?: number;
  objectAddress?: string;
  contactEmail?: string;
  orderNumber?: string;
  additionalWorkNotes?: string;
  deficiencies?: string;
  quoteNeeded?: boolean;
  quoteNeededFor?: string;
  plantStatus?: PlantStatus;
  orderType?: OrderType;
  securityEquipmentOk?: boolean;
  overnightStays?: string;
  followUpVisitNeeded?: boolean;
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
    contactPhone: input.contactPhone?.trim() || undefined,
    technicianName: input.technicianName?.trim() || undefined,
    status: 'open',
    notes: input.notes?.trim() || undefined,
    performedWork: input.performedWork?.trim() || undefined,
    plannedLaborHours:
      input.plannedLaborHours !== undefined && Number.isFinite(input.plannedLaborHours) && input.plannedLaborHours > 0
        ? input.plannedLaborHours
        : undefined,
    objectAddress: input.objectAddress?.trim() || undefined,
    contactEmail: input.contactEmail?.trim() || undefined,
    orderNumber: input.orderNumber?.trim() || undefined,
    additionalWorkNotes: input.additionalWorkNotes?.trim() || undefined,
    deficiencies: input.deficiencies?.trim() || undefined,
    quoteNeeded: input.quoteNeeded,
    quoteNeededFor: input.quoteNeededFor?.trim() || undefined,
    plantStatus: input.plantStatus,
    orderType: input.orderType,
    securityEquipmentOk: input.securityEquipmentOk,
    overnightStays: input.overnightStays?.trim() || undefined,
    followUpVisitNeeded: input.followUpVisitNeeded,
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

// 'locked' und 'not-exported' sind keine eigenen ReportStatus-Werte, sondern
// Filter auf zusätzliche Zeitstempel (finalizedAt/exportedAt) - als Filter
// aber eine eigene, genauere Sicht auf den Datenbestand.
export type ReportFilter = 'all' | ReportStatus | 'locked' | 'not-exported';

/** Liste aller Berichte, neueste Änderung zuerst. */
export async function listReports(filter: ReportFilter = 'all'): Promise<ServiceReport[]> {
  const db = await getDB();
  const useStatusIndex = filter === 'open' || filter === 'completed';
  const all = useStatusIndex ? await db.getAllFromIndex('reports', 'status', filter) : await db.getAll('reports');
  const filtered =
    filter === 'locked'
      ? all.filter((report) => !!report.finalizedAt)
      : filter === 'not-exported'
        ? all.filter((report) => !report.exportedAt)
        : all;
  return filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Alle Berichte mit exakt dieser Projektnummer (jeder Status), älteste
 * zuerst - Grundlage für die "X. Bericht zu diesem Projekt"-Anzeige und die
 * Duplikat-Prüfung beim Direkt-Einchecken (siehe startProjectByNumber() in
 * clockActions.ts). Nutzt den bereits vorhandenen `projectNumber`-Index,
 * kein Schema-Änderung nötig.
 */
export async function listReportsByProjectNumber(projectNumber: string): Promise<ServiceReport[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('reports', 'projectNumber', projectNumber.trim());
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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
    | 'projectNumber'
    | 'projectDescription'
    | 'customer'
    | 'contactPerson'
    | 'contactPhone'
    | 'technicianName'
    | 'status'
    | 'notes'
    | 'performedWork'
    | 'plannedLaborHours'
    | 'objectAddress'
    | 'contactEmail'
    | 'orderNumber'
    | 'additionalWorkNotes'
    | 'deficiencies'
    | 'quoteNeeded'
    | 'quoteNeededFor'
    | 'plantStatus'
    | 'orderType'
    | 'securityEquipmentOk'
    | 'overnightStays'
    | 'followUpVisitNeeded'
  >
>;

export async function updateReport(id: ID, patch: UpdateReportPatch): Promise<ServiceReport | undefined> {
  return withReportTransaction(id, (report) => {
    if (patch.projectNumber !== undefined) report.projectNumber = patch.projectNumber.trim();
    if (patch.projectDescription !== undefined) report.projectDescription = patch.projectDescription.trim() || undefined;
    if (patch.customer !== undefined) report.customer = patch.customer.trim() || undefined;
    if (patch.contactPerson !== undefined) report.contactPerson = patch.contactPerson.trim() || undefined;
    if (patch.contactPhone !== undefined) report.contactPhone = patch.contactPhone.trim() || undefined;
    if (patch.technicianName !== undefined) report.technicianName = patch.technicianName.trim() || undefined;
    if (patch.status !== undefined) report.status = patch.status;
    if (patch.notes !== undefined) report.notes = patch.notes.trim() || undefined;
    if (patch.performedWork !== undefined) report.performedWork = patch.performedWork.trim() || undefined;
    if (patch.plannedLaborHours !== undefined) {
      report.plannedLaborHours =
        Number.isFinite(patch.plannedLaborHours) && patch.plannedLaborHours > 0 ? patch.plannedLaborHours : undefined;
    }
    if (patch.objectAddress !== undefined) report.objectAddress = patch.objectAddress.trim() || undefined;
    if (patch.contactEmail !== undefined) report.contactEmail = patch.contactEmail.trim() || undefined;
    if (patch.orderNumber !== undefined) report.orderNumber = patch.orderNumber.trim() || undefined;
    if (patch.additionalWorkNotes !== undefined) report.additionalWorkNotes = patch.additionalWorkNotes.trim() || undefined;
    if (patch.deficiencies !== undefined) report.deficiencies = patch.deficiencies.trim() || undefined;
    if (patch.quoteNeeded !== undefined) report.quoteNeeded = patch.quoteNeeded;
    if (patch.quoteNeededFor !== undefined) report.quoteNeededFor = patch.quoteNeededFor.trim() || undefined;
    if (patch.plantStatus !== undefined) report.plantStatus = patch.plantStatus;
    if (patch.orderType !== undefined) report.orderType = patch.orderType;
    if (patch.securityEquipmentOk !== undefined) report.securityEquipmentOk = patch.securityEquipmentOk;
    if (patch.overnightStays !== undefined) report.overnightStays = patch.overnightStays.trim() || undefined;
    if (patch.followUpVisitNeeded !== undefined) report.followUpVisitNeeded = patch.followUpVisitNeeded;
    report.updatedAt = new Date().toISOString();
  });
}

export interface SetReportSignatureInput {
  blob: Blob;
  width: number;
  height: number;
  signedByName?: string;
}

/**
 * Speichert (oder ersetzt) die Kunden-Unterschrift eines Berichts und sperrt
 * ihn damit (siehe `finalizedAt` auf ServiceReport). War der Bericht bereits
 * über finalizeReport() gesperrt (z.B. nachträglich doch noch unterschrieben),
 * bleibt der ursprüngliche finalizedAt-Zeitpunkt erhalten.
 */
export async function setReportSignature(id: ID, input: SetReportSignatureInput): Promise<ServiceReport | undefined> {
  return withReportTransaction(id, (report) => {
    const now = new Date().toISOString();
    report.signatureBlob = input.blob;
    report.signatureWidth = input.width;
    report.signatureHeight = input.height;
    report.signedByName = input.signedByName?.trim() || undefined;
    report.signedAt = now;
    report.finalizedAt = report.finalizedAt ?? now;
    report.updatedAt = now;
  });
}

/**
 * Schließt einen Bericht final ab und sperrt ihn - ohne Kunden-Unterschrift,
 * z.B. wenn keine Unterschrift nötig oder möglich ist. Gleicher Sperr-
 * Mechanismus wie setReportSignature() (siehe `finalizedAt`), nur ohne die
 * Unterschriften-Felder zu setzen.
 */
export async function finalizeReport(id: ID): Promise<ServiceReport | undefined> {
  return withReportTransaction(id, (report) => {
    const now = new Date().toISOString();
    report.status = 'completed';
    report.finalizedAt = report.finalizedAt ?? now;
    report.updatedAt = now;
  });
}

/**
 * Hebt die Sperre eines Berichts vollständig wieder auf - egal ob sie durch
 * eine Unterschrift oder durch finalizeReport() entstanden ist. Entfernt
 * dabei auch eine ggf. vorhandene Unterschrift, da diese sich sonst auf
 * danach wieder änderbare Daten beziehen würde.
 */
export async function unlockReport(id: ID): Promise<ServiceReport | undefined> {
  return withReportTransaction(id, (report) => {
    report.signatureBlob = undefined;
    report.signatureWidth = undefined;
    report.signatureHeight = undefined;
    report.signedByName = undefined;
    report.signedAt = undefined;
    report.finalizedAt = undefined;
    report.updatedAt = new Date().toISOString();
  });
}

/** Merkt den Zeitpunkt des letzten erfolgreichen Word-Exports/Downloads/Teilens vor. */
export async function markReportExported(id: ID): Promise<ServiceReport | undefined> {
  return withReportTransaction(id, (report) => {
    const now = new Date().toISOString();
    report.exportedAt = now;
    report.updatedAt = now;
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
