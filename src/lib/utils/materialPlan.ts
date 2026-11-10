import type { MaterialItem } from '../db/types';

type PlanFields = Pick<MaterialItem, 'quantity' | 'plannedQuantity' | 'quantityConfirmed'>;

/**
 * Soll/Ist-Stand einer Materialposition gegenüber dem Serviceauftrag:
 * - 'none': kein Soll bekannt (manuell angelegte Position)
 * - 'open': Menge steht noch unverändert auf dem Soll und wurde nicht bestätigt
 * - 'ok':   wie geplant verbaut (bestätigt)
 * - 'diff': verbaute Menge weicht vom Soll ab
 * Eine abweichende Menge gilt immer als bearbeitet, auch ohne Bestätigung.
 */
export type MaterialPlanStatus = 'none' | 'open' | 'ok' | 'diff';

export function materialPlanStatus(item: PlanFields): MaterialPlanStatus {
  if (item.plannedQuantity === undefined) return 'none';
  if (item.quantity !== item.plannedQuantity) return 'diff';
  return item.quantityConfirmed ? 'ok' : 'open';
}

export interface MaterialPlanSummary {
  planned: number;
  open: number;
  ok: number;
  diff: number;
}

export function summarizeMaterialPlan(items: readonly PlanFields[]): MaterialPlanSummary {
  const summary: MaterialPlanSummary = { planned: 0, open: 0, ok: 0, diff: 0 };
  for (const item of items) {
    const status = materialPlanStatus(item);
    if (status === 'none') continue;
    summary.planned++;
    summary[status]++;
  }
  return summary;
}

function formatNumberDE(value: number): string {
  return value.toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

/** "−2 m" / "+3 Stk" - Abweichung der verbauten Menge vom Soll. */
export function formatPlanDeviation(item: Pick<MaterialItem, 'quantity' | 'plannedQuantity' | 'unit'>): string {
  const delta = item.quantity - (item.plannedQuantity ?? item.quantity);
  const sign = delta > 0 ? '+' : '−';
  return `${sign}${formatNumberDE(Math.abs(delta))} ${item.unit}`.trim();
}

/** Nächste Menge beim Antippen von Plus/Minus: ganze Schritte, nie unter 0. */
export function stepQuantity(quantity: number, direction: 1 | -1): number {
  return Math.max(0, Math.round((quantity + direction) * 100) / 100);
}
