import { describe, expect, it } from 'vitest';
import { formatPlanDeviation, materialPlanStatus, stepQuantity, summarizeMaterialPlan } from '../../lib/utils/materialPlan';

describe('materialPlanStatus', () => {
  it('kennt für manuell angelegte Positionen kein Soll', () => {
    expect(materialPlanStatus({ quantity: 3 })).toBe('none');
  });

  it('ist offen, solange die Menge unverändert auf dem Soll steht und nicht bestätigt wurde', () => {
    expect(materialPlanStatus({ quantity: 10, plannedQuantity: 10 })).toBe('open');
  });

  it('ist ok, sobald "wie geplant" bestätigt wurde', () => {
    expect(materialPlanStatus({ quantity: 10, plannedQuantity: 10, quantityConfirmed: true })).toBe('ok');
  });

  it('wertet jede abweichende Menge als Abweichung, auch ohne Bestätigung (z.B. vor Einführung des Abgleichs geändert)', () => {
    expect(materialPlanStatus({ quantity: 8, plannedQuantity: 10 })).toBe('diff');
    expect(materialPlanStatus({ quantity: 0, plannedQuantity: 10, quantityConfirmed: true })).toBe('diff');
  });
});

describe('summarizeMaterialPlan', () => {
  it('zählt nur Positionen mit Soll', () => {
    expect(
      summarizeMaterialPlan([
        { quantity: 1 },
        { quantity: 10, plannedQuantity: 10 },
        { quantity: 10, plannedQuantity: 10, quantityConfirmed: true },
        { quantity: 12, plannedQuantity: 10, quantityConfirmed: true }
      ])
    ).toEqual({ planned: 3, open: 1, ok: 1, diff: 1 });
  });
});

describe('formatPlanDeviation', () => {
  it('zeigt Minder- und Mehrmengen mit Einheit', () => {
    expect(formatPlanDeviation({ quantity: 8, plannedQuantity: 10, unit: 'm' })).toBe('−2 m');
    expect(formatPlanDeviation({ quantity: 13, plannedQuantity: 10, unit: 'Stk' })).toBe('+3 Stk');
    expect(formatPlanDeviation({ quantity: 7.5, plannedQuantity: 10, unit: 'm' })).toBe('−2,5 m');
  });
});

describe('stepQuantity', () => {
  it('geht in ganzen Schritten und nie unter 0', () => {
    expect(stepQuantity(10, 1)).toBe(11);
    expect(stepQuantity(1, -1)).toBe(0);
    expect(stepQuantity(0, -1)).toBe(0);
    expect(stepQuantity(0.5, -1)).toBe(0);
    expect(stepQuantity(2.5, 1)).toBe(3.5);
  });
});
