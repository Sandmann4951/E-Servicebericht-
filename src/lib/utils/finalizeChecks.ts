import type { MaterialItem, TimeEntry } from '../db/types';
import { summarizeMaterialPlan } from './materialPlan';

export type FinalizeAction = 'export' | 'finalize' | 'sign';
export type ReportTab = 'übersicht' | 'zeiten' | 'material' | 'fotos' | 'unterschrift';

export interface FinalizeWarning {
  key: 'no-times' | 'still-checked-in' | 'travel-without-km' | 'no-performed-work' | 'material-unconfirmed';
  text: string;
  /** Reiter, in dem sich der Punkt beheben lässt. */
  tab: ReportTab;
}

function count(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/**
 * Hinweise, die der Abschluss-Assistent vor Export/Abschluss anzeigt. Sie
 * blockieren nicht (anders als die Pflichtfelder, siehe
 * reportFinalization.ts), sollen aber typische Lücken sichtbar machen,
 * bevor der Bericht im Büro landet.
 */
export function collectFinalizeWarnings(input: {
  timeEntries: readonly TimeEntry[];
  materialItems: readonly MaterialItem[];
  performedWork: string | undefined;
  action: FinalizeAction;
}): FinalizeWarning[] {
  const warnings: FinalizeWarning[] = [];
  const entries = input.timeEntries.filter((entry) => !entry.isBreak);

  if (entries.length === 0) {
    warnings.push({ key: 'no-times', text: 'Es sind noch keine Zeiten erfasst.', tab: 'zeiten' });
  }

  if (entries.some((entry) => entry.startTime && !entry.endTime)) {
    warnings.push({
      key: 'still-checked-in',
      text:
        input.action === 'export'
          ? 'Du bist noch eingecheckt – die laufende Zeit fehlt im Export.'
          : 'Du bist noch eingecheckt – beim Abschließen wird automatisch ausgecheckt.',
      tab: 'übersicht'
    });
  }

  const travelWithoutKm = entries.filter((entry) => entry.isTravel && entry.endTime && entry.kilometers === undefined).length;
  if (travelWithoutKm > 0) {
    warnings.push({
      key: 'travel-without-km',
      text: `${count(travelWithoutKm, 'Fahrtzeit', 'Fahrtzeiten')} ohne Kilometer-Angabe.`,
      tab: 'zeiten'
    });
  }

  if (!input.performedWork?.trim()) {
    warnings.push({ key: 'no-performed-work', text: '„Durchgeführte Arbeiten“ ist noch leer.', tab: 'übersicht' });
  }

  const openMaterial = summarizeMaterialPlan(input.materialItems).open;
  if (openMaterial > 0) {
    warnings.push({
      key: 'material-unconfirmed',
      text: `${count(openMaterial, 'Materialposition', 'Materialpositionen')} aus dem Serviceauftrag ${openMaterial === 1 ? 'ist' : 'sind'} noch nicht bestätigt.`,
      tab: 'material'
    });
  }

  return warnings;
}
