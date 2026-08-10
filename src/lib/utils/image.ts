/** Bildverarbeitung für Einsatzfotos: erzeugt ein kleines Thumbnail clientseitig. */

const MAX_THUMBNAIL_EDGE = 400;
const THUMBNAIL_QUALITY = 0.6;

export interface ThumbnailResult {
  thumbnailBlob: Blob;
  width: number;
  height: number;
}

/**
 * Erzeugt aus einer Bilddatei (Kamera-/Bibliotheks-Upload) ein JPEG-
 * Thumbnail (max. ~400px Kantenlänge). `imageOrientation: 'from-image'`
 * sorgt dafür, dass die EXIF-Rotation von iPhone-Fotos korrekt angewendet
 * wird, statt das Bild verdreht anzuzeigen.
 */
export async function createThumbnail(file: Blob): Promise<ThumbnailResult> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const { width, height } = bitmap;
    const scale = Math.min(1, MAX_THUMBNAIL_EDGE / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D-Context nicht verfügbar');
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

    const thumbnailBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Thumbnail-Erzeugung fehlgeschlagen'))),
        'image/jpeg',
        THUMBNAIL_QUALITY
      );
    });

    return { thumbnailBlob, width, height };
  } finally {
    bitmap.close();
  }
}
