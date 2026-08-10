import type { DBSchema } from 'idb';

export type ID = string; // crypto.randomUUID()
export type ISODate = string; // "2026-08-10"
export type ISODateTime = string; // vollständiger ISO-8601-Zeitstempel

export type ReportStatus = 'open' | 'completed';

/**
 * Ein Servicebericht. `technicianName` ist bewusst ein freies Textfeld (kein
 * Fremdschlüssel) - Platzhalter für eine spätere Nutzerzuordnung, wenn mehrere
 * Monteure die App verwenden. Die *Count/-Duration-Felder sind denormalisiert,
 * damit die Listenansicht ausschließlich den `reports`-Store lesen muss und
 * nie Zeiten/Material/Foto-Stores anfassen muss.
 */
export interface ServiceReport {
  id: ID;
  projectNumber: string;
  customer?: string;
  technicianName?: string;
  status: ReportStatus;
  notes?: string;

  timeEntryCount: number;
  totalDurationMinutes: number;
  materialItemCount: number;
  photoCount: number;

  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface TimeEntry {
  id: ID;
  reportId: ID;
  date: ISODate;
  startTime?: string; // "HH:mm"
  endTime?: string; // "HH:mm"
  durationMinutes?: number;
  note?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface MaterialItem {
  id: ID;
  reportId: ID;
  description: string;
  quantity: number;
  unit: string;
  articleNumber?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Photo {
  id: ID;
  reportId: ID;
  blob: Blob;
  thumbnailBlob: Blob;
  mimeType: string;
  width?: number;
  height?: number;
  sizeBytes: number;
  takenAt: ISODateTime;
}

export interface ServiceBerichtDB extends DBSchema {
  reports: {
    key: ID;
    value: ServiceReport;
    indexes: { projectNumber: string; status: string; updatedAt: string };
  };
  timeEntries: {
    key: ID;
    value: TimeEntry;
    indexes: { reportId: string; date: string };
  };
  materialItems: {
    key: ID;
    value: MaterialItem;
    indexes: { reportId: string };
  };
  photos: {
    key: ID;
    value: Photo;
    indexes: { reportId: string };
  };
}

export const DB_NAME = 'e-servicebericht-db';
export const DB_VERSION = 1;
