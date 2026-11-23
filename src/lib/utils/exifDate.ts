/**
 * Liest das Aufnahmedatum (EXIF DateTimeOriginal, ersatzweise
 * DateTimeDigitized bzw. DateTime) aus einer JPEG-Datei - ohne
 * Fremdbibliothek, nur der kleine Teil des EXIF-Formats, der dafür nötig ist:
 * JPEG-APP1-Segment "Exif" -> TIFF-Header -> IFD0 -> Exif-IFD (Tag 0x8769).
 *
 * Rückgabe ist die lokale Uhrzeit der Kamera als "YYYY-MM-DDTHH:MM:SS" (EXIF
 * kennt keine Zeitzone), oder undefined, wenn kein Datum enthalten ist (z.B.
 * PNG, Screenshot, oder ein Browser hat die Metadaten entfernt).
 */

const TAG_EXIF_IFD = 0x8769;
const TAG_DATE_TIME = 0x0132;
const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TAG_DATE_TIME_DIGITIZED = 0x9004;
const TYPE_ASCII = 2;

/** EXIF liegt immer am Dateianfang - mehr als die ersten 256 KB müssen nie gelesen werden. */
export const EXIF_SCAN_BYTES = 256 * 1024;

export function readExifCaptureDate(bytes: Uint8Array): string | undefined {
  try {
    return findInJpeg(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  } catch {
    // Kaputte/abgeschnittene Metadaten sind kein Fehler - dann eben ohne Aufnahmedatum.
    return undefined;
  }
}

/** Liest das Aufnahmedatum direkt aus einer Bilddatei (siehe readExifCaptureDate). */
export async function readExifCaptureDateFromBlob(blob: Blob): Promise<string | undefined> {
  try {
    const buffer = await blob.slice(0, EXIF_SCAN_BYTES).arrayBuffer();
    return readExifCaptureDate(new Uint8Array(buffer));
  } catch {
    return undefined;
  }
}

function findInJpeg(view: DataView): string | undefined {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return undefined;
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return undefined;
    const marker = view.getUint8(offset + 1);
    // Start of Scan / End of Image: danach kommen keine Metadaten mehr.
    if (marker === 0xda || marker === 0xd9) return undefined;
    const length = view.getUint16(offset + 2);
    if (length < 2) return undefined;
    const segmentStart = offset + 4;
    if (marker === 0xe1 && segmentStart + 6 <= view.byteLength && readAscii(view, segmentStart, 4) === 'Exif') {
      const date = readTiff(view, segmentStart + 6, Math.min(view.byteLength, offset + 2 + length));
      if (date) return date;
    }
    offset += 2 + length;
  }
  return undefined;
}

function readTiff(view: DataView, tiffStart: number, end: number): string | undefined {
  const order = readAscii(view, tiffStart, 2);
  if (order !== 'II' && order !== 'MM') return undefined;
  const le = order === 'II';
  if (view.getUint16(tiffStart + 2, le) !== 42) return undefined;

  const ifd0 = readIfd(view, tiffStart, tiffStart + view.getUint32(tiffStart + 4, le), end, le);
  const exifPointer = ifd0.get(TAG_EXIF_IFD);
  if (exifPointer) {
    const exifIfd = readIfd(view, tiffStart, tiffStart + exifPointer.valueOffset, end, le);
    const date =
      asciiValue(view, tiffStart, end, exifIfd.get(TAG_DATE_TIME_ORIGINAL)) ??
      asciiValue(view, tiffStart, end, exifIfd.get(TAG_DATE_TIME_DIGITIZED));
    if (date) return date;
  }
  return asciiValue(view, tiffStart, end, ifd0.get(TAG_DATE_TIME));
}

interface IfdEntry {
  type: number;
  count: number;
  /** Rohwert des 4-Byte-Wertfelds (bei Strings > 4 Zeichen: Offset ab TIFF-Start). */
  valueOffset: number;
  /** Position des 4-Byte-Wertfelds selbst (für Strings <= 4 Zeichen, hier praktisch nie). */
  fieldPos: number;
}

function readIfd(view: DataView, tiffStart: number, ifdStart: number, end: number, le: boolean): Map<number, IfdEntry> {
  const entries = new Map<number, IfdEntry>();
  if (ifdStart < tiffStart || ifdStart + 2 > end) return entries;
  const count = view.getUint16(ifdStart, le);
  for (let i = 0; i < count; i++) {
    const entry = ifdStart + 2 + i * 12;
    if (entry + 12 > end) break;
    entries.set(view.getUint16(entry, le), {
      type: view.getUint16(entry + 2, le),
      count: view.getUint32(entry + 4, le),
      valueOffset: view.getUint32(entry + 8, le),
      fieldPos: entry + 8
    });
  }
  return entries;
}

function asciiValue(view: DataView, tiffStart: number, end: number, entry: IfdEntry | undefined): string | undefined {
  if (!entry || entry.type !== TYPE_ASCII || entry.count < 19) return undefined;
  const start = entry.count <= 4 ? entry.fieldPos : tiffStart + entry.valueOffset;
  if (start + 19 > end) return undefined;
  return normalizeExifDate(readAscii(view, start, 19));
}

/** "2026:11:23 09:14:05" -> "2026-11-23T09:14:05"; leere/genullte Werte ("0000:00:00 ...") -> undefined. */
function normalizeExifDate(raw: string): string | undefined {
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(raw);
  if (!match) return undefined;
  const [, y, mo, d, h, mi, s] = match;
  if (y === '0000' || mo === '00' || d === '00') return undefined;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}

function readAscii(view: DataView, start: number, length: number): string {
  let text = '';
  for (let i = 0; i < length && start + i < view.byteLength; i++) text += String.fromCharCode(view.getUint8(start + i));
  return text;
}
