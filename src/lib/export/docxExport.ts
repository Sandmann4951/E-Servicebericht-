import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from 'docx';
import type { ServiceReport } from '../db/types';
import { formatDateDE, formatDateTimeDE, formatDurationMinutes } from '../utils/date';
import type { FullReport } from './getFullReport';

/** Breite eines eingebetteten Fotos im Dokument, in Pixeln (bei 96dpi ≈ 10,5cm). */
const PHOTO_MAX_WIDTH_PX = 400;

function heading(text: string): Paragraph {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2 });
}

function keyValueRow(label: string, value: string): TableRow {
  return new TableRow({
    children: [
      cell(label, { width: 30, bold: true }),
      cell(value, { width: 70 })
    ]
  });
}

function cell(text: string, options: { width: number; bold?: boolean } = { width: 25 }): TableCell {
  return new TableCell({
    width: { size: options.width, type: WidthType.PERCENTAGE },
    children: [new Paragraph({ children: [new TextRun({ text, bold: options.bold })] })]
  });
}

function headerRow(labels: string[]): TableRow {
  const width = 100 / labels.length;
  return new TableRow({
    children: labels.map((label) => cell(label, { width, bold: true }))
  });
}

function dataRow(values: string[], options: { bold?: boolean } = {}): TableRow {
  const width = 100 / values.length;
  return new TableRow({
    children: values.map((value) => cell(value, { width, bold: options.bold }))
  });
}

function buildHeaderSection(report: ServiceReport): (Paragraph | Table)[] {
  return [
    new Paragraph({ text: 'Servicebericht', heading: HeadingLevel.TITLE }),
    new Paragraph({ text: `Projektnummer: ${report.projectNumber}`, alignment: AlignmentType.LEFT }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        keyValueRow('Kunde', report.customer || '–'),
        keyValueRow('Techniker', report.technicianName || '–'),
        keyValueRow('Status', report.status === 'completed' ? 'Abgeschlossen' : 'Offen'),
        keyValueRow('Erstellt am', formatDateTimeDE(report.createdAt)),
        keyValueRow('Stand', formatDateTimeDE(report.updatedAt))
      ]
    })
  ];
}

function buildTimeEntriesSection(data: FullReport): (Paragraph | Table)[] {
  const { timeEntries, report } = data;
  if (timeEntries.length === 0) {
    return [heading('Zeiten'), new Paragraph({ text: 'Keine Zeiten erfasst.' })];
  }

  const rows = [
    headerRow(['Datum', 'Start', 'Ende', 'Dauer', 'Notiz']),
    ...timeEntries.map((entry) =>
      dataRow([
        formatDateDE(entry.date),
        entry.startTime ?? '–',
        entry.endTime ?? '–',
        formatDurationMinutes(entry.durationMinutes),
        entry.note ?? ''
      ])
    ),
    dataRow(['', '', '', formatDurationMinutes(report.totalDurationMinutes), 'Gesamt'], { bold: true })
  ];

  return [heading('Zeiten'), new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })];
}

function buildMaterialSection(data: FullReport): (Paragraph | Table)[] {
  const { materialItems } = data;
  if (materialItems.length === 0) {
    return [heading('Material'), new Paragraph({ text: 'Kein Material erfasst.' })];
  }

  const rows = [
    headerRow(['Bezeichnung', 'Menge', 'Einheit', 'Artikelnummer']),
    ...materialItems.map((item) =>
      dataRow([item.description, String(item.quantity), item.unit, item.articleNumber ?? '–'])
    )
  ];

  return [heading('Material'), new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })];
}

function buildNotesSection(data: FullReport): Paragraph[] {
  const notes = data.report.notes?.trim();
  if (!notes) return [];
  return [heading('Notizen'), ...notes.split('\n').map((line) => new Paragraph({ text: line }))];
}

async function buildPhotosSection(data: FullReport): Promise<(Paragraph | Table)[]> {
  const { photos } = data;
  if (photos.length === 0) return [];

  const children: (Paragraph | Table)[] = [heading('Fotos')];
  for (const photo of photos) {
    const buffer = await photo.thumbnailBlob.arrayBuffer();
    const width = photo.width && photo.height ? Math.min(PHOTO_MAX_WIDTH_PX, photo.width) : PHOTO_MAX_WIDTH_PX;
    const height =
      photo.width && photo.height ? Math.round((width / photo.width) * photo.height) : Math.round(width * 0.75);

    children.push(
      new Paragraph({
        children: [
          new ImageRun({
            type: 'jpg',
            data: buffer,
            transformation: { width, height }
          })
        ]
      }),
      new Paragraph({ text: formatDateTimeDE(photo.takenAt) })
    );
  }
  return children;
}

/** Baut ein editierbares Word-Dokument aus einem vollständigen Bericht. Rein clientseitig, keine DB-/DOM-Zugriffe. */
export async function buildReportDocx(data: FullReport): Promise<Blob> {
  const children: (Paragraph | Table)[] = [
    ...buildHeaderSection(data.report),
    ...buildTimeEntriesSection(data),
    ...buildMaterialSection(data),
    ...buildNotesSection(data),
    ...(await buildPhotosSection(data))
  ];

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBlob(doc);
}

/** Dateiname-Vorschlag für den Download, z.B. "Servicebericht-2026-0142.docx". */
export function suggestedFileName(report: ServiceReport): string {
  const safeProject = report.projectNumber.trim().replace(/[^\w.-]+/g, '_') || 'ohne-Projektnummer';
  return `Servicebericht-${safeProject}.docx`;
}
