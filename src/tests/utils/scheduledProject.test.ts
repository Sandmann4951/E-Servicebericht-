import { describe, expect, it } from 'vitest';
import { findReportByProjectNumber, pinReports } from '../../lib/utils/scheduledProject';
import type { ServiceReport } from '../../lib/db/types';

function fakeReport(overrides: Partial<ServiceReport> = {}): ServiceReport {
  return {
    id: 'r1',
    projectNumber: '2026-001',
    status: 'open',
    timeEntryCount: 0,
    totalDurationMinutes: 0,
    materialItemCount: 0,
    photoCount: 0,
    createdAt: '2026-08-10T08:00:00.000Z',
    updatedAt: '2026-08-10T08:00:00.000Z',
    ...overrides
  };
}

describe('findReportByProjectNumber', () => {
  it('findet den Bericht mit exakt passender Projektnummer', () => {
    const reports = [fakeReport({ id: 'a', projectNumber: '2026-001' }), fakeReport({ id: 'b', projectNumber: '2026-002' })];
    expect(findReportByProjectNumber(reports, '2026-002')?.id).toBe('b');
  });

  it('liefert undefined ohne Treffer', () => {
    const reports = [fakeReport({ id: 'a', projectNumber: '2026-001' })];
    expect(findReportByProjectNumber(reports, '2026-999')).toBeUndefined();
  });

  it('liefert undefined ohne angegebene Projektnummer', () => {
    const reports = [fakeReport({ id: 'a', projectNumber: '2026-001' })];
    expect(findReportByProjectNumber(reports, undefined)).toBeUndefined();
  });
});

describe('pinReports', () => {
  const reports = [
    fakeReport({ id: 'a' }),
    fakeReport({ id: 'b' }),
    fakeReport({ id: 'c' }),
    fakeReport({ id: 'd' })
  ];

  it('lässt die Liste unverändert, wenn weder eingecheckt noch geplant gesetzt ist', () => {
    expect(pinReports(reports, undefined, undefined).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('zieht den heute geplanten Bericht nach vorn', () => {
    expect(pinReports(reports, undefined, 'c').map((r) => r.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('zieht den eingecheckten Bericht nach vorn', () => {
    expect(pinReports(reports, 'd', undefined).map((r) => r.id)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('eingecheckter Bericht hat Vorrang vor dem heute geplanten, wenn beide unterschiedlich sind', () => {
    expect(pinReports(reports, 'd', 'c').map((r) => r.id)).toEqual(['d', 'c', 'a', 'b']);
  });

  it('funktioniert, wenn eingecheckter und geplanter Bericht identisch sind', () => {
    expect(pinReports(reports, 'c', 'c').map((r) => r.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('ignoriert eine ID, die in der Liste nicht (mehr) vorkommt', () => {
    expect(pinReports(reports, 'nicht-vorhanden', undefined).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('mutiert die übergebene Liste nicht', () => {
    const copy = [...reports];
    pinReports(reports, 'd', undefined);
    expect(reports).toEqual(copy);
  });
});
