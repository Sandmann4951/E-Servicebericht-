import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTestDB } from '../testUtils';
import { createReport, markReportExported } from '../../lib/db/reports';
import {
  listUnexportedReportsInRange,
  resolvePeriodRange,
  suggestedBulkZipFileName,
  uniqueFileName
} from '../../lib/export/bulkExport';

beforeEach(async () => {
  await resetTestDB();
});

// Systemzeit in den folgenden Tests bewusst nur für `Date` gefaked (nicht
// Timer), auf Mittag UTC gesetzt - gleiches Muster wie in reports.test.ts.
// Mittag statt Mitternacht vermeidet, dass eine lokale Zeitzone das Datum
// über eine Tagesgrenze verschiebt, ohne fake-indexeddbs eigene
// Timer-basierte Verarbeitung zu stören.

describe('resolvePeriodRange', () => {
  it('"today" liefert Start=Ende=heute', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-12T12:00:00.000Z'));
    try {
      expect(resolvePeriodRange('today')).toEqual({ start: '2026-08-12', end: '2026-08-12' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('"week" liefert Montag der aktuellen Woche bis heute', () => {
    // 2026-08-12 ist ein Mittwoch, die Woche begann am 2026-08-10 (Montag).
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-12T12:00:00.000Z'));
    try {
      expect(resolvePeriodRange('week')).toEqual({ start: '2026-08-10', end: '2026-08-12' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('"month" liefert den 1. des aktuellen Monats bis heute', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-12T12:00:00.000Z'));
    try {
      expect(resolvePeriodRange('month')).toEqual({ start: '2026-08-01', end: '2026-08-12' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('"custom" übernimmt den übergebenen Bereich unverändert', () => {
    expect(resolvePeriodRange('custom', { start: '2026-01-01', end: '2026-01-31' })).toEqual({
      start: '2026-01-01',
      end: '2026-01-31'
    });
  });

  it('"custom" ohne übergebenen Bereich liefert einen leeren Bereich', () => {
    expect(resolvePeriodRange('custom')).toEqual({});
  });

  it('"all" liefert einen leeren Bereich (kein Datumsfilter)', () => {
    expect(resolvePeriodRange('all')).toEqual({});
  });
});

describe('listUnexportedReportsInRange', () => {
  it('liefert alle nicht exportierten Berichte ohne Zeitraum (leerer Bereich = kein Filter)', async () => {
    await createReport({ projectNumber: 'A' });
    await createReport({ projectNumber: 'B' });
    const exported = await createReport({ projectNumber: 'C' });
    await markReportExported(exported.id);

    const result = await listUnexportedReportsInRange({});

    expect(result.map((r) => r.projectNumber).sort()).toEqual(['A', 'B']);
  });

  it('filtert nach updatedAt innerhalb des Bereichs', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-08-01T12:00:00.000Z'));
      await createReport({ projectNumber: 'ALT' });
      vi.setSystemTime(new Date('2026-08-15T12:00:00.000Z'));
      await createReport({ projectNumber: 'IM-BEREICH' });
      vi.setSystemTime(new Date('2026-08-31T12:00:00.000Z'));
      await createReport({ projectNumber: 'NEU' });
    } finally {
      vi.useRealTimers();
    }

    const result = await listUnexportedReportsInRange({ start: '2026-08-10', end: '2026-08-20' });

    expect(result.map((r) => r.projectNumber)).toEqual(['IM-BEREICH']);
  });

  it('schließt bereits exportierte Berichte auch innerhalb des Zeitraums aus', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-08-15T12:00:00.000Z'));
      const report = await createReport({ projectNumber: 'X' });
      await markReportExported(report.id);
    } finally {
      vi.useRealTimers();
    }

    const result = await listUnexportedReportsInRange({ start: '2026-08-01', end: '2026-08-31' });

    expect(result).toEqual([]);
  });

  it('Start und Ende des Bereichs sind inklusive', async () => {
    let startDay, endDay;
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-08-10T12:00:00.000Z'));
      startDay = await createReport({ projectNumber: 'START' });
      vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'));
      endDay = await createReport({ projectNumber: 'ENDE' });
    } finally {
      vi.useRealTimers();
    }

    const result = await listUnexportedReportsInRange({ start: '2026-08-10', end: '2026-08-20' });

    expect(result.map((r) => r.id).sort()).toEqual([startDay.id, endDay.id].sort());
  });

  it('nur ein Start ohne Ende schließt alles Frühere aus, aber nichts Späteres', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-08-05T12:00:00.000Z'));
      await createReport({ projectNumber: 'VORHER' });
      vi.setSystemTime(new Date('2026-08-25T12:00:00.000Z'));
      await createReport({ projectNumber: 'NACHHER' });
    } finally {
      vi.useRealTimers();
    }

    const result = await listUnexportedReportsInRange({ start: '2026-08-10' });

    expect(result.map((r) => r.projectNumber)).toEqual(['NACHHER']);
  });
});

describe('uniqueFileName', () => {
  it('lässt einen neuen Dateinamen unverändert', () => {
    const used = new Set<string>();
    expect(uniqueFileName('Servicebericht-A.docx', used)).toBe('Servicebericht-A.docx');
  });

  it('hängt bei Kollision "-2" vor die Dateiendung', () => {
    const used = new Set(['Servicebericht-A.docx']);
    expect(uniqueFileName('Servicebericht-A.docx', used)).toBe('Servicebericht-A-2.docx');
  });

  it('zählt bei mehrfachen Kollisionen weiter hoch', () => {
    const used = new Set(['Servicebericht-A.docx', 'Servicebericht-A-2.docx', 'Servicebericht-A-3.docx']);
    expect(uniqueFileName('Servicebericht-A.docx', used)).toBe('Servicebericht-A-4.docx');
  });

  it('merkt sich vergebene Namen im übergebenen Set - der nächste Aufruf mit demselben Namen kollidiert wieder', () => {
    const used = new Set<string>();
    const first = uniqueFileName('X.docx', used);
    const second = uniqueFileName('X.docx', used);
    expect(first).toBe('X.docx');
    expect(second).toBe('X-2.docx');
  });

  it('funktioniert auch ohne Dateiendung', () => {
    const used = new Set(['Datei']);
    expect(uniqueFileName('Datei', used)).toBe('Datei-2');
  });
});

describe('suggestedBulkZipFileName', () => {
  it('enthält das heutige Datum im Dateinamen', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-12T12:00:00.000Z'));
    try {
      expect(suggestedBulkZipFileName()).toBe('Rivo-Berichte-Export-2026-08-12.zip');
    } finally {
      vi.useRealTimers();
    }
  });
});
