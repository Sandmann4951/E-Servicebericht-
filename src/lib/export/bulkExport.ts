import { listReports, markReportExported } from '../db/reports';
import type { ServiceReport } from '../db/types';
import { startOfWeekISO, todayISODate } from '../utils/date';

export type ExportPeriod = 'all' | 'today' | 'week' | 'month' | 'custom';

export interface PeriodRange {
  /** "YYYY-MM-DD", inklusive. Kein Wert = kein unterer Rand. */
  start?: string;
  /** "YYYY-MM-DD", inklusive. Kein Wert = kein oberer Rand. */
  end?: string;
}

/**
 * Berechnet den Datumsbereich für eine der vordefinierten Perioden. "custom"
 * übernimmt den vom Nutzer eingegebenen Bereich unverändert, "all" liefert
 * einen leeren Bereich (= kein Datumsfilter, siehe listUnexportedReportsInRange()).
 */
export function resolvePeriodRange(period: ExportPeriod, custom?: PeriodRange): PeriodRange {
  const today = todayISODate();
  switch (period) {
    case 'today':
      return { start: today, end: today };
    case 'week':
      return { start: startOfWeekISO(today), end: today };
    case 'month':
      return { start: `${today.slice(0, 7)}-01`, end: today };
    case 'custom':
      return custom ?? {};
    case 'all':
    default:
      return {};
  }
}

/**
 * Alle noch nicht exportierten Berichte, deren letzte Änderung (`updatedAt`)
 * im gewählten Zeitraum liegt - bewusst `updatedAt` statt der Zeiteinträge
 * eines Berichts als Filterkriterium: das ist derselbe Wert, den die
 * Berichtsliste ohnehin als "Zuletzt geändert" anzeigt und nach dem sie
 * sortiert, also für den Monteur ein vertrautes, vorhersagbares Kriterium -
 * und kommt ohne zusätzliche Zeiteintrags-Abfrage pro Bericht aus.
 */
export async function listUnexportedReportsInRange(range: PeriodRange): Promise<ServiceReport[]> {
  const all = await listReports('not-exported');
  if (!range.start && !range.end) return all;
  return all.filter((report) => {
    const date = report.updatedAt.slice(0, 10);
    if (range.start && date < range.start) return false;
    if (range.end && date > range.end) return false;
    return true;
  });
}

/**
 * Hängt bei einer Namenskollision "-2", "-3", ... vor die Dateiendung -
 * mehrere Berichte zur selben Projektnummer (erneuter Besuch, siehe
 * startProjectByNumber() in clockActions.ts) erzeugen sonst identische
 * Dateinamen ("Servicebericht-2026-0142.docx" mehrfach), die sich beim
 * gemeinsamen Teilen/im ZIP gegenseitig überschreiben würden.
 */
export function uniqueFileName(fileName: string, used: Set<string>): string {
  if (!used.has(fileName)) {
    used.add(fileName);
    return fileName;
  }
  const dotIndex = fileName.lastIndexOf('.');
  const base = dotIndex === -1 ? fileName : fileName.slice(0, dotIndex);
  const ext = dotIndex === -1 ? '' : fileName.slice(dotIndex);
  let n = 2;
  let candidate = `${base}-${n}${ext}`;
  while (used.has(candidate)) {
    n += 1;
    candidate = `${base}-${n}${ext}`;
  }
  used.add(candidate);
  return candidate;
}

export function suggestedBulkZipFileName(): string {
  return `Rivo-Berichte-Export-${todayISODate()}.zip`;
}

export interface BulkExportProgress {
  done: number;
  total: number;
}

export interface BulkExportResult {
  exportedCount: number;
  failed: ServiceReport[];
  /** true = Nutzer hat das Teilen-Sheet abgebrochen; nichts wurde als exportiert markiert. */
  aborted?: boolean;
}

/**
 * Baut aus jedem übergebenen Bericht ein Word-Dokument, teilt/lädt alle
 * zusammen herunter und markiert die erfolgreichen als exportiert.
 * Bevorzugt einen einzigen navigator.share()-Aufruf mit allen Dateien
 * (iOS: direkt aus dem Share-Sheet z.B. per Mail/AirDrop verschicken -
 * genau wie beim Einzel-Export in ReportDetail.svelte), fällt sonst auf ein
 * einzelnes ZIP-Archiv zum Download zurück: mehrere <a download>-Klicks
 * hintereinander werden von iOS Safari nur unzuverlässig/gar nicht erlaubt,
 * ein ZIP ist der verlässliche Fallback für "viele Dateien auf einmal".
 *
 * Markiert jeden erfolgreich gebauten Bericht sofort als exportiert, auch
 * im ZIP-Fallback - der Browser meldet nicht zurück, ob der Download vom
 * Nutzer tatsächlich gespeichert wurde, das ist dieselbe Grenze wie beim
 * bestehenden Einzel-Export.
 */
export async function bulkExportReports(
  reports: ServiceReport[],
  onProgress?: (progress: BulkExportProgress) => void
): Promise<BulkExportResult> {
  // Dynamisch nachgeladen statt statisch importiert (genau wie beim
  // Einzel-Export in ReportDetail.svelte): docx/getFullReport ziehen die
  // ~370 KB schwere docx-Bibliothek nach sich - ein statischer Import hier
  // würde sie ins Hauptbundle ziehen (ReportList.svelte -> BulkExportDialog
  // -> bulkExport.ts wird beim App-Start immer geladen), statt sie nur bei
  // tatsächlicher Nutzung nachzuladen.
  const [{ getFullReport }, { buildReportDocx, suggestedFileName }] = await Promise.all([
    import('./getFullReport'),
    import('./docxExport')
  ]);

  const files: File[] = [];
  const failed: ServiceReport[] = [];
  const usedNames = new Set<string>();

  for (let i = 0; i < reports.length; i++) {
    const report = reports[i];
    try {
      const data = await getFullReport(report.id);
      if (!data) throw new Error('Bericht nicht gefunden');
      const blob = await buildReportDocx(data);
      const fileName = uniqueFileName(suggestedFileName(report), usedNames);
      const mimeType = blob.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      files.push(new File([blob], fileName, { type: mimeType }));
    } catch (err) {
      console.error('Bericht-Export fehlgeschlagen', report.id, err);
      failed.push(report);
    }
    onProgress?.({ done: i + 1, total: reports.length });
  }

  if (files.length === 0) {
    return { exportedCount: 0, failed };
  }

  if (navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files, title: `${files.length} Serviceberichte` });
    } catch (err) {
      // Vom Nutzer abgebrochenes Teilen-Sheet ist kein Fehler (gleiches
      // Muster wie beim Einzel-Export in ReportDetail.svelte) - dann bleibt
      // nichts als exportiert markiert, statt fälschlich zu melden, die
      // Berichte seien schon verschickt.
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { exportedCount: 0, failed: [], aborted: true };
      }
      throw err;
    }
  } else {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    for (const file of files) {
      zip.file(file.name, file);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = suggestedBulkZipFileName();
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  const failedIds = new Set(failed.map((r) => r.id));
  const exportedReports = reports.filter((r) => !failedIds.has(r.id));
  await Promise.all(exportedReports.map((r) => markReportExported(r.id)));

  return { exportedCount: exportedReports.length, failed };
}
