import { describe, expect, it } from 'vitest';
import { readExifCaptureDate, readExifCaptureDateFromBlob } from '../../lib/utils/exifDate';
import { jpegWithExifDate } from './exifFixture';

describe('readExifCaptureDate', () => {
  it('liest DateTimeOriginal aus dem Exif-IFD (Little Endian, wie iPhone)', () => {
    expect(readExifCaptureDate(jpegWithExifDate('2026:11:20 08:47:31'))).toBe('2026-11-20T08:47:31');
  });

  it('liest auch Big-Endian-Dateien', () => {
    expect(readExifCaptureDate(jpegWithExifDate('2025:01:02 17:05:00', { littleEndian: false }))).toBe('2025-01-02T17:05:00');
  });

  it('fällt auf DateTime aus IFD0 zurück', () => {
    expect(readExifCaptureDate(jpegWithExifDate('2026:03:04 10:11:12', { tag: 'ifd0' }))).toBe('2026-03-04T10:11:12');
  });

  it('ignoriert genullte Datumswerte', () => {
    expect(readExifCaptureDate(jpegWithExifDate('0000:00:00 00:00:00'))).toBeUndefined();
  });

  it('liefert undefined für Nicht-JPEG, leere und abgeschnittene Daten', () => {
    expect(readExifCaptureDate(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeUndefined();
    expect(readExifCaptureDate(new Uint8Array([]))).toBeUndefined();
    expect(readExifCaptureDate(jpegWithExifDate('2026:11:20 08:47:31').slice(0, 30))).toBeUndefined();
  });

  it('liest direkt aus einem Blob', async () => {
    const blob = new Blob([jpegWithExifDate('2026:11:20 08:47:31')], { type: 'image/jpeg' });
    expect(await readExifCaptureDateFromBlob(blob)).toBe('2026-11-20T08:47:31');
  });
});
