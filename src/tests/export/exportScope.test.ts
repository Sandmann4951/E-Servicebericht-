import { describe, expect, it } from 'vitest';
import {
  filterToUnreportedOnly,
  hasUnreportedContent,
  isMaterialItemFullyReported,
  isTimeEntryReported,
  remainingMaterialQuantity,
  reportNeverExported
} from '../../lib/export/exportScope';
import type { FullReport } from '../../lib/export/getFullReport';
import type { MaterialItem, ServiceReport, TimeEntry } from '../../lib/db/types';

function makeTimeEntry(overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: overrides.id ?? 'time-1',
    reportId: 'report-1',
    date: '2026-08-10',
    startTime: '08:00',
    endTime: '12:00',
    durationMinutes: 240,
    createdAt: '2026-08-10T08:00:00.000Z',
    updatedAt: '2026-08-10T08:00:00.000Z',
    ...overrides
  };
}

function makeMaterialItem(overrides: Partial<MaterialItem> = {}): MaterialItem {
  return {
    id: overrides.id ?? 'material-1',
    reportId: 'report-1',
    description: 'Kabel NYM-J 3x1,5',
    quantity: 10,
    unit: 'm',
    createdAt: '2026-08-10T08:00:00.000Z',
    updatedAt: '2026-08-10T08:00:00.000Z',
    ...overrides
  };
}

function makeFullReport(overrides: Partial<FullReport> = {}): FullReport {
  const report: ServiceReport = {
    id: 'report-1',
    projectNumber: '2026-0001',
    status: 'open',
    timeEntryCount: 0,
    totalDurationMinutes: 0,
    materialItemCount: 0,
    photoCount: 0,
    createdAt: '2026-08-10T08:00:00.000Z',
    updatedAt: '2026-08-10T08:00:00.000Z',
    ...overrides.report
  };
  return {
    report,
    timeEntries: overrides.timeEntries ?? [],
    breaks: overrides.breaks ?? [],
    materialItems: overrides.materialItems ?? [],
    photos: overrides.photos ?? []
  };
}

describe('exportScope - reportNeverExported', () => {
  it('ist true ohne exportedAt', () => {
    expect(reportNeverExported({ exportedAt: undefined })).toBe(true);
  });

  it('ist false mit gesetztem exportedAt', () => {
    expect(reportNeverExported({ exportedAt: '2026-08-10T08:00:00.000Z' })).toBe(false);
  });
});

describe('exportScope - Material-Restmenge', () => {
  it('liefert die volle Menge ohne reportedQuantity', () => {
    expect(remainingMaterialQuantity({ quantity: 10, reportedQuantity: undefined })).toBe(10);
  });

  it('liefert den Rest bei teilweise berichteter Menge', () => {
    expect(remainingMaterialQuantity({ quantity: 10, reportedQuantity: 4 })).toBe(6);
  });

  it('wird nie negativ, selbst wenn reportedQuantity größer als die aktuelle quantity ist', () => {
    expect(remainingMaterialQuantity({ quantity: 3, reportedQuantity: 10 })).toBe(0);
  });

  it('isMaterialItemFullyReported ist true genau wenn der Rest 0 ist', () => {
    expect(isMaterialItemFullyReported({ quantity: 10, reportedQuantity: 10 })).toBe(true);
    expect(isMaterialItemFullyReported({ quantity: 10, reportedQuantity: 9 })).toBe(false);
    expect(isMaterialItemFullyReported({ quantity: 10, reportedQuantity: undefined })).toBe(false);
  });
});

describe('exportScope - Zeiteintrag berichtet', () => {
  it('isTimeEntryReported ist false ohne reportedAt (auch bei Alteinträgen ohne dieses Feld)', () => {
    expect(isTimeEntryReported({ reportedAt: undefined })).toBe(false);
  });

  it('isTimeEntryReported ist true mit gesetztem reportedAt', () => {
    expect(isTimeEntryReported({ reportedAt: '2026-08-10T08:00:00.000Z' })).toBe(true);
  });
});

describe('exportScope - hasUnreportedContent', () => {
  it('ist false, wenn alle Zeiten berichtet und alles Material vollständig abgedeckt ist', () => {
    const data = {
      timeEntries: [makeTimeEntry({ reportedAt: '2026-08-10T08:00:00.000Z' })],
      materialItems: [makeMaterialItem({ quantity: 10, reportedQuantity: 10 })]
    };
    expect(hasUnreportedContent(data)).toBe(false);
  });

  it('ist true, wenn mindestens ein Zeiteintrag noch nicht berichtet ist', () => {
    const data = {
      timeEntries: [makeTimeEntry({ reportedAt: undefined })],
      materialItems: [makeMaterialItem({ quantity: 10, reportedQuantity: 10 })]
    };
    expect(hasUnreportedContent(data)).toBe(true);
  });

  it('ist true, wenn bei Material noch ein Rest offen ist', () => {
    const data = {
      timeEntries: [makeTimeEntry({ reportedAt: '2026-08-10T08:00:00.000Z' })],
      materialItems: [makeMaterialItem({ quantity: 10, reportedQuantity: 6 })]
    };
    expect(hasUnreportedContent(data)).toBe(true);
  });

  it('ist false bei leeren Listen (nichts zu berichten, aber auch nichts Neues)', () => {
    expect(hasUnreportedContent({ timeEntries: [], materialItems: [] })).toBe(false);
  });
});

describe('exportScope - filterToUnreportedOnly', () => {
  it('lässt bereits berichtete Zeiteinträge weg und behält unberichtete', () => {
    const reportedEntry = makeTimeEntry({ id: 'time-reported', reportedAt: '2026-08-10T08:00:00.000Z' });
    const newEntry = makeTimeEntry({ id: 'time-new', reportedAt: undefined });
    const data = makeFullReport({ timeEntries: [reportedEntry, newEntry] });

    const filtered = filterToUnreportedOnly(data);
    expect(filtered.timeEntries.map((entry) => entry.id)).toEqual(['time-new']);
  });

  it('lässt vollständig berichtetes Material weg und behält Rest-Positionen mit auf den Rest reduzierter quantity', () => {
    const fullyReported = makeMaterialItem({ id: 'material-done', quantity: 5, reportedQuantity: 5 });
    const partial = makeMaterialItem({ id: 'material-partial', quantity: 10, reportedQuantity: 4 });
    const untouched = makeMaterialItem({ id: 'material-new', quantity: 3, reportedQuantity: undefined });
    const data = makeFullReport({ materialItems: [fullyReported, partial, untouched] });

    const filtered = filterToUnreportedOnly(data);
    expect(filtered.materialItems).toHaveLength(2);
    const byId = new Map(filtered.materialItems.map((item) => [item.id, item]));
    expect(byId.get('material-partial')?.quantity).toBe(6);
    expect(byId.get('material-new')?.quantity).toBe(3);
  });

  it('verändert die übergebenen Original-Objekte nicht (reine Funktion)', () => {
    const partial = makeMaterialItem({ id: 'material-partial', quantity: 10, reportedQuantity: 4 });
    const data = makeFullReport({ materialItems: [partial] });

    filterToUnreportedOnly(data);
    expect(partial.quantity).toBe(10);
  });
});
