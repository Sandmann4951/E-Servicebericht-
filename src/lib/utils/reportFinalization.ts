import type { ServiceReport } from '../db/types';

/**
 * Pflichtfelder vor dem ENDGÜLTIGEN Abschließen eines Berichts (sowohl über
 * Unterschreiben als auch über "Ohne Unterschrift final abschließen" - s.
 * ReportDetail.svelte saveSignature()/finalizeWithoutSignature()). Gilt
 * bewusst nur für künftige Abschluss-Versuche: bereits gesperrte Altberichte,
 * die diese Felder (noch) nicht gesetzt haben, werden dadurch NICHT
 * rückwirkend ungültig - die Prüfung greift nur beim Abschließen selbst,
 * nie beim Laden/Anzeigen eines Berichts.
 */
type RequiredFieldKey = 'plantStatus' | 'securityEquipmentOk' | 'followUpVisitNeeded';

const REQUIRED_FIELDS_FOR_FINALIZE: { key: RequiredFieldKey; label: string }[] = [
  { key: 'plantStatus', label: 'Anlagenstatus' },
  { key: 'securityEquipmentOk', label: 'Sicherheitseinrichtungen' },
  { key: 'followUpVisitNeeded', label: 'Folgeeinsatz' }
];

/** Liste der fehlenden Pflichtfelder (als Anzeige-Label), leer wenn alle gesetzt sind. */
export function missingRequiredFieldsForFinalize(values: Pick<ServiceReport, RequiredFieldKey>): string[] {
  return REQUIRED_FIELDS_FOR_FINALIZE.filter(({ key }) => values[key] === undefined).map(({ label }) => label);
}
