import { describe, expect, it } from 'vitest';
import { findReportByProjectNumber, findReportsByProjectNumbers, pinReports } from '../../lib/utils/scheduledProject';
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

describe('findReportsByProjectNumbers', () => {
  const reports = [
    fakeReport({ id: 'a', projectNumber: '2026-001' }),
    fakeReport({ id: 'b', projectNumber: '2026-002' }),
    fakeReport({ id: 'c', projectNumber: '2026-003' })
  ];

  it('findet mehrere Berichte und behält die Reihenfolge der übergebenen Projektnummern bei', () => {
    expect(findReportsByProjectNumbers(reports, ['2026-003', '2026-001']).map((r) => r.id)).toEqual(['c', 'a']);
  });

  it('überspringt Projektnummern ohne passenden Bericht', () => {
    expect(findReportsByProjectNumbers(reports, ['2026-999', '2026-002']).map((r) => r.id)).toEqual(['b']);
  });

  it('liefert eine leere Liste bei leerer Eingabe', () => {
    expect(findReportsByProjectNumbers(reports, [])).toEqual([]);
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
    expect(pinReports(reports, undefined, []).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('zieht einen einzelnen heute geplanten Bericht nach vorn', () => {
    expect(pinReports(reports, undefined, ['c']).map((r) => r.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('zieht mehrere heute geplante Berichte nach vorn, in der übergebenen Reihenfolge', () => {
    expect(pinReports(reports, undefined, ['c', 'a']).map((r) => r.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('zieht den eingecheckten Bericht nach vorn', () => {
    expect(pinReports(reports, 'd', []).map((r) => r.id)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('eingecheckter Bericht hat Vorrang vor den heute geplanten, wenn unterschiedlich', () => {
    expect(pinReports(reports, 'd', ['c', 'a']).map((r) => r.id)).toEqual(['d', 'c', 'a', 'b']);
  });

  it('funktioniert, wenn eingecheckter Bericht auch einer der geplanten ist (taucht nur einmal auf)', () => {
    expect(pinReports(reports, 'c', ['c', 'a']).map((r) => r.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('ignoriert eine ID, die in der Liste nicht (mehr) vorkommt', () => {
    expect(pinReports(reports, 'nicht-vorhanden', ['auch-nicht']).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('mutiert die übergebene Liste nicht', () => {
    const copy = [...reports];
    pinReports(reports, 'd', ['c']);
    expect(reports).toEqual(copy);
  });
});
