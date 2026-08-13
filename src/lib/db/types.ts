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
  projectDescription?: string;
  customer?: string;
  contactPerson?: string;
  technicianName?: string;
  status: ReportStatus;
  notes?: string;

  /** Kunden-Unterschrift (Abnahme) als PNG-Blob vom Unterschriften-Pad, inkl. Original-Pixelgröße für den Export. */
  signatureBlob?: Blob;
  signatureWidth?: number;
  signatureHeight?: number;
  signedByName?: string;
  signedAt?: ISODateTime;

  /**
   * Der eigentliche "gesperrt"-Zeitstempel: wird gesetzt, sobald der Bericht
   * final abgeschlossen wird - entweder automatisch beim Erfassen einer
   * Kunden-Unterschrift (setReportSignature) oder manuell durch den Monteur
   * ohne Unterschrift (finalizeReport), z.B. wenn keine Unterschrift nötig
   * oder möglich ist. `signedAt` beschreibt nur zusätzlich, OB (und wie)
   * unterschrieben wurde - für die Sperre selbst zählt allein `finalizedAt`.
   */
  finalizedAt?: ISODateTime;

  /** Zeitpunkt des letzten erfolgreichen Word-Exports/Downloads/Teilens - für die "bereits eingereicht?"-Anzeige in der Übersicht. */
  exportedAt?: ISODateTime;

  timeEntryCount: number;
  totalDurationMinutes: number;
  materialItemCount: number;
  photoCount: number;

  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface TimeEntry {
  id: ID;
  /**
   * Optional seit der Tagesstempeluhr: `undefined` bedeutet Leerlaufzeit
   * (eingestempelt, aber keinem Projekt zugeordnet). Manuell im Zeiten-Tab
   * erfasste Einträge haben immer eine reportId, wie bisher.
   */
  reportId?: ID;
  /**
   * Verknüpfung zum Tagesstempel (WorkDay), der diesen Eintrag erzeugt hat -
   * nur gesetzt für Einträge aus der Tagesstempeluhr (checkInDay/
   * switchToProject/switchToIdle), NIE für manuell im Zeiten-Tab erfasste
   * Einträge.
   */
  workDayId?: ID;
  date: ISODate;
  startTime?: string; // "HH:mm"
  endTime?: string; // "HH:mm"
  durationMinutes?: number;
  note?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/**
 * Der Tagesstempel: unabhängig von einem konkreten Projekt, umschließt
 * beliebig viele Projekt-/Leerlaufzeit-TimeEntry-Abschnitte (siehe
 * TimeEntry.workDayId). Es kann global immer nur höchstens ein WorkDay ohne
 * checkOutTime geben (durchgesetzt in der Action-Schicht, src/lib/clockActions.ts).
 */
export interface WorkDay {
  id: ID;
  date: ISODate; // lokales Datum beim Einstempeln
  checkInTime?: string; // "HH:mm"
  checkOutTime?: string; // "HH:mm" - undefined = Tag noch aktiv
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type AbsenceType = 'vacation' | 'sick' | 'timeoff';

/**
 * Eine Abwesenheit (Urlaub/Krank/Zeitausgleich) für einen ganzen Kalendertag
 * - auch rückwirkend oder für die Zukunft eintragbar, unabhängig von der
 * Tagesstempeluhr. Bewusst OHNE eigene uuid: das Datum selbst ist der
 * Primärschlüssel (keyPath in der DB) - es kann nur eine Abwesenheit pro Tag
 * geben, ein erneutes Speichern für denselben Tag überschreibt die
 * vorherige Eintragung automatisch (Upsert statt Duplikat-Vermeidung).
 */
export interface Absence {
  date: ISODate;
  type: AbsenceType;
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
    indexes: { reportId: string; date: string; workDayId: string };
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
  workDays: {
    key: ID;
    value: WorkDay;
    indexes: { date: string };
  };
  absences: {
    key: ISODate;
    value: Absence;
  };
}

export const DB_NAME = 'e-servicebericht-db';
export const DB_VERSION = 4;
