import type { DBSchema } from 'idb';

export type ID = string; // crypto.randomUUID()
export type ISODate = string; // "2026-08-10"
export type ISODateTime = string; // vollständiger ISO-8601-Zeitstempel

export type ReportStatus = 'open' | 'completed';

/**
 * Exakt die festen Auswahloptionen der "Anlagenstatus"-Dropdown-
 * Inhaltssteuerung in der ELSA-Vorlage (ohne deren Platzhalter-Eintrag "-",
 * der dort nur "nichts ausgewählt" bedeutet - das entspricht hier `undefined`).
 */
export type PlantStatus =
  | 'Installation Einsatzbereit'
  | 'Installation läuft noch'
  | 'Probebetrieb'
  | 'bedingt Einsatzbereit'
  | 'nicht Einsatzbereit'
  | 'Gesperrt';

/** Exakt die festen Auswahloptionen der "Auftrag"-Dropdown-Inhaltssteuerung ("Art des Auftrags") in der ELSA-Vorlage. */
export type OrderType =
  | 'Installation'
  | 'Reparatur'
  | 'Reparatur & Inspektion'
  | 'Inspektion'
  | 'Inbetriebnahme'
  | 'Schulung / Einweisung'
  | 'Gewährleistung'
  | 'Messtechnik'
  | 'Prüfung';

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
  /**
   * Telefonnummer des Ansprechpartners, getrennt von `contactPerson`
   * (reiner Name) - beim Serviceauftrag-Import automatisch aus der dort
   * separat erkannten Nummer vorbefüllt (siehe importServiceOrder.ts),
   * sonst frei editierbar. Vorher (bis zu diesem Feld) wurde die Nummer
   * fälschlich in den `contactPerson`-Text gemergt ("Name (Tel. 0123...)")
   * - ältere, so gespeicherte Berichte haben deshalb weiterhin dieses
   * Altformat in `contactPerson` und KEIN `contactPhone`; der Word-Export
   * erkennt das rein darstellungsseitig und trennt es dort wieder auf
   * (siehe `splitContactPersonAndPhone()` in utils/contactPerson.ts, auch
   * von der Unterschrift-Vorausfüllung in ReportDetail.svelte genutzt) - die
   * gespeicherten Daten selbst werden dabei nicht verändert.
   */
  contactPhone?: string;
  technicianName?: string;
  status: ReportStatus;
  notes?: string;
  /**
   * Eigenes Feld für die im Word-Export unter "Durchgeführte Arbeiten:"
   * eintragene Beschreibung - bewusst GETRENNT vom allgemeinen `notes`-Feld
   * ("Notizen"), weil der Nutzer dafür ein eigenständiges Feld in der App
   * wollte statt `notes` doppelt zu verwenden. `notes` bleibt als freies
   * "was ist mir sonst noch aufgefallen"-Feld bestehen.
   */
  performedWork?: string;

  /** Füllt das Vorlagenfeld "Objektadresse/Einsatzort:" (bisher ungenutzt). */
  objectAddress?: string;
  /** E-Mail des Ansprechpartners, analog zu `contactPhone` - füllt "E-Mail:" (bisher ungenutzt). */
  contactEmail?: string;
  /**
   * Bestellnummer/Auftragsbestätigung des Kunden - rein manuelles Feld, füllt
   * "Bestellnummer/AB:" (bisher ungenutzt). Der Serviceauftrag-PDF-Parser
   * (siehe utils/serviceOrderImport.ts) erkennt im ELSA-PDF-Format keine
   * Bestellnummer (geprüft - nur eine "Dok-nr." des Serviceauftrags-Dokuments
   * selbst, bereits als Hinweiszeile in den Notizen übernommen, siehe
   * import/importServiceOrder.ts), deshalb kein Auto-Vorschlag hierfür.
   */
  orderNumber?: string;
  /** Füllt "Mehrungen:" (bisher ungenutzt) - zusätzlich zum Auftrag festgestellter Mehraufwand. */
  additionalWorkNotes?: string;
  /** Füllt "Festgestellte Mängel:" (bisher ungenutzt). */
  deficiencies?: string;
  /**
   * Braucht der Kunde ein Angebot? `undefined` = noch nicht beantwortet
   * (Vorlagenfeld bleibt leer, wie bei allen anderen optionalen Feldern).
   * Siehe `quoteNeededFor` für das zugehörige "wofür"-Freitextfeld.
   */
  quoteNeeded?: boolean;
  /**
   * Wofür ein Angebot gebraucht wird - nur bei `quoteNeeded === true`
   * eingebbar/relevant. Füllt zusammen mit `quoteNeeded` das Vorlagenfeld
   * "Angebot benötigt für:" (bisher ungenutzt; bei `quoteNeeded === false`
   * wird dort "Nein" eingetragen, bei `undefined` bleibt es leer - siehe
   * docxExport.ts).
   */
  quoteNeededFor?: string;
  /**
   * Füllt die "Anlagenstatus"-Auswahl der Vorlage - exakt deren feste, in
   * der Vorlage selbst vorgegebene Optionen (Dropdown-Inhaltssteuerung,
   * bisher ungenutzt) statt einer eigens erfundenen Ja/Nein-Auswahl.
   */
  plantStatus?: PlantStatus;
  /**
   * Füllt die "Auftrag"-Auswahl der Vorlage ("Art des Auftrags") - exakt
   * deren feste, vorgegebene Optionen (Dropdown-Inhaltssteuerung, bisher
   * ungenutzt).
   */
  orderType?: OrderType;
  /**
   * Sicherheitseinrichtungen in Ordnung? Füllt "Sicherheitseinrichtungen:"
   * (bisher ungenutzt) mit "i.O."/"n.i.O." - das sind die von der Vorlage
   * selbst vorgegebenen Dropdown-Werte, keine eigene Ja/Nein-Beschriftung.
   */
  securityEquipmentOk?: boolean;
  /** Füllt "Übernachtung(en):" (bisher ungenutzt) - freier Text statt Zahl, da auch "keine" o.ä. üblich ist. */
  overnightStays?: string;
  /**
   * Muss ein Folgeeinsatz geplant werden? Füllt die "Folgeeinsatz"-Auswahl
   * der Vorlage (bisher ungenutzt) mit "Ja"/"Nein".
   */
  followUpVisitNeeded?: boolean;

  /**
   * Geplante Mannstunden für diesen Einsatz (Summe über alle Rollen/
   * Kategorien, z.B. Monteur + Azubi zusammen) - bei einem Serviceauftrag-
   * Import automatisch aus den "Arbeitsaufwand"-Stunden-Positionen
   * vorbefüllt (siehe importServiceOrder.ts), für jeden Bericht aber frei
   * editier-/nachtragbar. Rein informativ zum Abgleich mit der tatsächlich
   * erfassten Zeit (totalDurationMinutes) in der Übersicht - keine eigene
   * Validierung/Begrenzung.
   */
  plannedLaborHours?: number;

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

  /**
   * Anzahl UNTERSCHIEDLICHER Kalendertage mit mindestens einem Zeiteintrag -
   * trotz des Namens NICHT die Anzahl der TimeEntry-Datensätze selbst (in
   * der UI als "Tage" angezeigt, s. ReportCard.svelte/ReportDetail.svelte).
   * Mehrfaches Ein-/Ausstempeln am selben Tag erhöht diesen Wert deshalb
   * nur einmal, nicht pro Vorgang - siehe recomputeReportSummary().
   */
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
  /**
   * Markiert eine unbezahlte Pause (aus dem Tagesausstempeln heraus erfasst,
   * siehe clockActions.checkOutDay()) - hat wie Leerlaufzeit nie eine
   * reportId, zählt aber zusätzlich NIRGENDS als Arbeitszeit (weder
   * produktiv noch Leerlaufzeit): getDayStats(), getDayProjectBreakdown()
   * und listUnassignedIdleEntries() ignorieren Einträge mit isBreak. Kein
   * eigener DB_VERSION-Bump nötig - ein optionales neues Feld, bestehende
   * Einträge ohne dieses Feld gelten automatisch als "keine Pause".
   */
  isBreak?: boolean;
  /**
   * Nur bei isBreak-Einträgen gesetzt: dokumentiert, welche Nachbar-Einträge
   * beim Anlegen dieser Pause gekürzt/gesplittet/gelöscht wurden (siehe
   * timeEntries.trimOverlappingTimeEntries()) - Grundlage für
   * restoreBreak(), das diese Änderungen beim Löschen der Pause wieder
   * rückgängig macht.
   */
  trimRecords?: TimeEntryTrimRecord[];
  /**
   * Markiert einen Fahrtzeit-Abschnitt (über den "Fahrtzeit"-Button im
   * Bericht eingecheckt, siehe clockActions.switchToTravel(), oder manuell im
   * Zeiten-Tab als Fahrtzeit erfasst). Gehört wie ein normaler
   * Projekt-Abschnitt zum Bericht (reportId gesetzt) und zählt ganz normal
   * als Arbeitszeit - die Markierung dient nur der Kennzeichnung in der
   * Zeitenliste und im Word-Export. Optionales Feld, kein DB_VERSION-Bump nötig.
   */
  isTravel?: boolean;
  /** Gefahrene Kilometer - nur bei Fahrtzeit-Einträgen (isTravel), beim Bearbeiten im Zeiten-Tab eintragbar. */
  kilometers?: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/**
 * Der "Vorher"-Zustand eines einzelnen Nachbar-Eintrags, der beim Anlegen
 * einer Pause weggeschnitten wurde - reicht aus, um trimOverlappingTimeEntries()
 * für genau diesen Eintrag wieder rückgängig zu machen (siehe
 * timeEntries.restoreBreak()).
 */
export interface TimeEntryTrimRecord {
  /** ID des ursprünglichen Eintrags (bleibt auch nach dem Wegschneiden gültig, außer bei wasDeleted). */
  entryId: ID;
  reportId?: ID;
  workDayId?: ID;
  date: ISODate;
  originalStartTime?: string;
  originalEndTime?: string;
  originalNote?: string;
  originalIsTravel?: boolean;
  originalKilometers?: number;
  /** true, wenn der Eintrag komplett im Pausenfenster lag und deshalb ganz gelöscht wurde. */
  wasDeleted: boolean;
  /** Falls der Eintrag gesplittet wurde: ID des dabei neu entstandenen zweiten Teils (wird beim Rückgängigmachen wieder gelöscht). */
  splitEntryId?: ID;
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
  /**
   * Erwartete/geplante Menge laut importiertem Serviceauftrag (siehe
   * src/lib/import/importServiceOrder.ts) - rein informativ zum Abgleich
   * mit der tatsächlich verbauten `quantity`, bleibt bei Abweichung
   * unverändert stehen. Nur gesetzt für per Import vorausgefüllte
   * Positionen - manuell angelegte Positionen haben kein "Soll".
   */
  plannedQuantity?: number;
  /**
   * Kommt diese Position aus dem Lager oder wird sie bestellt? Optional -
   * manuell angelegte Altpositionen (von vor Einführung dieses Felds) haben
   * keinen Wert. Füllt im Word-Export die Spalte "Lager (L) / Bestellung
   * (B)" der Materialtabelle mit genau dem Buchstaben, den die Vorlage
   * selbst als Spaltenbezeichnung nutzt.
   */
  source?: 'lager' | 'bestellung';
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
  /**
   * Eigene, unabhängige Notiz zu GENAU diesem Foto (nicht zu verwechseln
   * mit `ServiceReport.notes`, das für alle Fotos/den ganzen Bericht
   * gemeinsam gilt) - frei editierbar direkt im Fotos-Tab. Füllt im
   * Word-Export die "Beschreibung"-Spalte der Dokumentations-Tabelle
   * (Fallback auf den formatierten Zeitstempel, falls leer - siehe
   * docxExport.ts).
   */
  note?: string;
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
