/**
 * Baut eine minimale JPEG-Byte-Folge mit EXIF-Segment (nur SOI + APP1 + EOI,
 * keine echten Bilddaten) - genug für den EXIF-Leser in utils/exifDate.ts.
 * `date` im EXIF-Format "YYYY:MM:DD HH:MM:SS".
 */
export function jpegWithExifDate(date: string, options: { littleEndian?: boolean; tag?: 'original' | 'ifd0' } = {}): Uint8Array<ArrayBuffer> {
  const le = options.littleEndian ?? true;
  const useIfd0 = options.tag === 'ifd0';
  const dateBytes = new TextEncoder().encode(`${date}\0`); // 20 Bytes

  // TIFF-Layout: Header(8) | IFD0 (2 + 12 + 4 = 18) | ExifIFD (18) | Datum (20)
  const ifd0Offset = 8;
  const exifIfdOffset = ifd0Offset + 18;
  const dateOffset = exifIfdOffset + 18;
  const tiff = new DataView(new ArrayBuffer(dateOffset + dateBytes.length));
  tiff.setUint8(0, le ? 0x49 : 0x4d);
  tiff.setUint8(1, le ? 0x49 : 0x4d);
  tiff.setUint16(2, 42, le);
  tiff.setUint32(4, ifd0Offset, le);

  const writeEntry = (at: number, tag: number, type: number, count: number, value: number) => {
    tiff.setUint16(at, 1, le);
    tiff.setUint16(at + 2, tag, le);
    tiff.setUint16(at + 4, type, le);
    tiff.setUint32(at + 6, count, le);
    tiff.setUint32(at + 10, value, le);
    tiff.setUint32(at + 14, 0, le);
  };
  if (useIfd0) {
    writeEntry(ifd0Offset, 0x0132, 2, dateBytes.length, dateOffset);
  } else {
    writeEntry(ifd0Offset, 0x8769, 4, 1, exifIfdOffset);
    writeEntry(exifIfdOffset, 0x9003, 2, dateBytes.length, dateOffset);
  }
  const tiffBytes = new Uint8Array(tiff.buffer);
  tiffBytes.set(dateBytes, dateOffset);

  const header = new TextEncoder().encode('Exif\0\0');
  const segmentLength = 2 + header.length + tiffBytes.length;
  const out = new Uint8Array(2 + 4 + header.length + tiffBytes.length + 2);
  out.set([0xff, 0xd8, 0xff, 0xe1, segmentLength >> 8, segmentLength & 0xff], 0);
  out.set(header, 6);
  out.set(tiffBytes, 6 + header.length);
  out.set([0xff, 0xd9], out.length - 2);
  return out;
}
