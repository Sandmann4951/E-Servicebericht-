import { describe, expect, it } from 'vitest';
import { missingRequiredFieldsForFinalize } from '../../lib/utils/reportFinalization';

describe('missingRequiredFieldsForFinalize', () => {
  it('listet alle drei Pflichtfelder, wenn keines gesetzt ist', () => {
    const missing = missingRequiredFieldsForFinalize({
      plantStatus: undefined,
      securityEquipmentOk: undefined,
      followUpVisitNeeded: undefined
    });
    expect(missing).toEqual(['Anlagenstatus', 'Sicherheitseinrichtungen', 'Folgeeinsatz']);
  });

  it('listet nur die tatsächlich fehlenden Felder', () => {
    const missing = missingRequiredFieldsForFinalize({
      plantStatus: 'Installation Einsatzbereit',
      securityEquipmentOk: undefined,
      followUpVisitNeeded: true
    });
    expect(missing).toEqual(['Sicherheitseinrichtungen']);
  });

  it('ist leer, wenn alle drei Pflichtfelder gesetzt sind - auch bei securityEquipmentOk/followUpVisitNeeded === false', () => {
    const missing = missingRequiredFieldsForFinalize({
      plantStatus: 'Gesperrt',
      securityEquipmentOk: false,
      followUpVisitNeeded: false
    });
    expect(missing).toEqual([]);
  });
});
