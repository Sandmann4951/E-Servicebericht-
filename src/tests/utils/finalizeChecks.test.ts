import { describe, expect, it } from 'vitest';
import { collectFinalizeWarnings } from '../../lib/utils/finalizeChecks';
import type { MaterialItem, TimeEntry } from '../../lib/db/types';

function time(overrides: Partial<TimeEntry>): TimeEntry {
  return { id: crypto.randomUUID(), reportId: 'r', date: '2026-08-10', createdAt: '', updatedAt: '', ...overrides };
}
function material(overrides: Partial<MaterialItem>): MaterialItem {
  return { id: crypto.randomUUID(), reportId: 'r', description: 'Kabel', quantity: 1, unit: 'm', createdAt: '', updatedAt: '', ...overrides };
}

const complete = {
  timeEntries: [time({ startTime: '08:00', endTime: '12:00' })],
  materialItems: [material({})],
  performedWork: 'Wallbox montiert',
  action: 'export' as const
};

describe('collectFinalizeWarnings', () => {
  it('meldet bei einem vollständigen Bericht nichts', () => {
    expect(collectFinalizeWarnings(complete)).toEqual([]);
  });

  it('meldet fehlende Zeiten (Pausen zählen nicht) und leere "Durchgeführte Arbeiten"', () => {
    const warnings = collectFinalizeWarnings({
      ...complete,
      timeEntries: [time({ startTime: '12:00', endTime: '12:30', isBreak: true, reportId: undefined })],
      performedWork: '  '
    });
    expect(warnings.map((w) => w.key)).toEqual(['no-times', 'no-performed-work']);
    expect(warnings[0].tab).toBe('zeiten');
  });

  it('formuliert "noch eingecheckt" je nach Aktion anders', () => {
    const timeEntries = [time({ startTime: '08:00' })];
    expect(collectFinalizeWarnings({ ...complete, timeEntries })[0].text).toContain('fehlt im Export');
    expect(collectFinalizeWarnings({ ...complete, timeEntries, action: 'finalize' })[0].text).toContain('automatisch ausgecheckt');
  });

  it('zählt beendete Fahrtzeiten ohne Kilometer', () => {
    const warnings = collectFinalizeWarnings({
      ...complete,
      timeEntries: [
        time({ startTime: '07:00', endTime: '08:00', isTravel: true }),
        time({ startTime: '16:00', endTime: '17:00', isTravel: true }),
        time({ startTime: '08:00', endTime: '16:00' }),
        time({ startTime: '06:00', endTime: '07:00', isTravel: true, kilometers: 0 })
      ]
    });
    expect(warnings).toEqual([{ key: 'travel-without-km', text: '2 Fahrtzeiten ohne Kilometer-Angabe.', tab: 'zeiten' }]);
  });

  it('zählt unbestätigte Positionen aus dem Serviceauftrag', () => {
    const warnings = collectFinalizeWarnings({
      ...complete,
      materialItems: [material({ quantity: 5, plannedQuantity: 5 }), material({ quantity: 5, plannedQuantity: 5, quantityConfirmed: true })]
    });
    expect(warnings).toEqual([
      { key: 'material-unconfirmed', text: '1 Materialposition aus dem Serviceauftrag ist noch nicht bestätigt.', tab: 'material' }
    ]);
  });
});
