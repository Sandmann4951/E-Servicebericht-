import { getAllData, restoreAllData, type AllData } from '../db/backup';
import type { Photo } from '../db/types';

const BACKUP_FORMAT = 'e-servicebericht-backup-v1';

/** Foto-Datensatz mit den Blobs base64-kodiert statt als echte Blobs - JSON-tauglich. */
type SerializedPhoto = Omit<Photo, 'blob' | 'thumbnailBlob'> & {
  blobBase64: string;
  thumbnailBlobBase64: string;
};

interface BackupFile {
  format: string;
  exportedAt: string;
  reports: AllData['reports'];
  timeEntries: AllData['timeEntries'];
  materialItems: AllData['materialItems'];
  photos: SerializedPhoto[];
}

/**
 * ArrayBuffer -> base64, in Blöcken statt `String.fromCharCode(...bytes)` am
 * Stück - bei großen Fotos würde das sonst den Call-Stack sprengen. Nutzt
 * `btoa`/`atob` statt z.B. FileReader, da das sowohl im Browser als auch
 * unter Node (Vitest-Tests, `environment: 'node'`) verfügbar ist.
 */
async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

/** Baut die komplette Sicherungsdatei (JSON, Fotos base64-kodiert) als Blob. */
export async function buildBackupFile(): Promise<Blob> {
  const data = await getAllData();
  const photos: SerializedPhoto[] = await Promise.all(
    data.photos.map(async (photo) => {
      const { blob, thumbnailBlob, ...rest } = photo;
      const [blobBase64, thumbnailBlobBase64] = await Promise.all([blobToBase64(blob), blobToBase64(thumbnailBlob)]);
      return { ...rest, blobBase64, thumbnailBlobBase64 };
    })
  );

  const backup: BackupFile = {
    format: BACKUP_FORMAT,
    exportedAt: new Date().toISOString(),
    reports: data.reports,
    timeEntries: data.timeEntries,
    materialItems: data.materialItems,
    photos
  };
  return new Blob([JSON.stringify(backup)], { type: 'application/json' });
}

export interface BackupSummary {
  reportCount: number;
  timeEntryCount: number;
  materialItemCount: number;
  photoCount: number;
}

export interface ParsedBackup {
  data: AllData;
  summary: BackupSummary;
}

/** Liest + validiert eine Sicherungsdatei und wandelt die base64-Fotos zurück in Blobs. */
export async function parseBackupFile(file: File | Blob): Promise<ParsedBackup> {
  const text = await file.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Datei ist kein gültiges JSON.');
  }

  if (
    typeof json !== 'object' ||
    json === null ||
    (json as Partial<BackupFile>).format !== BACKUP_FORMAT ||
    !Array.isArray((json as Partial<BackupFile>).reports) ||
    !Array.isArray((json as Partial<BackupFile>).timeEntries) ||
    !Array.isArray((json as Partial<BackupFile>).materialItems) ||
    !Array.isArray((json as Partial<BackupFile>).photos)
  ) {
    throw new Error('Das ist keine gültige E-Servicebericht-Sicherungsdatei.');
  }

  const backup = json as BackupFile;
  const photos: Photo[] = backup.photos.map(({ blobBase64, thumbnailBlobBase64, ...rest }) => ({
    ...rest,
    blob: base64ToBlob(blobBase64, rest.mimeType),
    thumbnailBlob: base64ToBlob(thumbnailBlobBase64, rest.mimeType)
  }));

  const data: AllData = {
    reports: backup.reports,
    timeEntries: backup.timeEntries,
    materialItems: backup.materialItems,
    photos
  };

  return {
    data,
    summary: {
      reportCount: data.reports.length,
      timeEntryCount: data.timeEntries.length,
      materialItemCount: data.materialItems.length,
      photoCount: data.photos.length
    }
  };
}

export async function restoreBackup(data: AllData): Promise<void> {
  await restoreAllData(data);
}

/** Dateiname-Vorschlag für den Download, z.B. "E-Servicebericht-Backup-2026-08-11.json". */
export function suggestedBackupFileName(): string {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `E-Servicebericht-Backup-${date}.json`;
}
