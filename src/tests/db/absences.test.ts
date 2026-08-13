import { beforeEach, describe, expect, it } from 'vitest';
import { resetTestDB } from '../testUtils';
import { getAbsence, listAbsencesInRange, listAllAbsences, removeAbsence, setAbsence } from '../../lib/db/absences';

beforeEach(async () => {
  await resetTestDB();
});

describe('setAbsence / getAbsence', () => {
  it('legt eine neue Abwesenheit an', async () => {
    const absence = await setAbsence('2026-08-11', 'vacation', 'Sommerurlaub');

    expect(absence.date).toBe('2026-08-11');
    expect(absence.type).toBe('vacation');
    expect(absence.note).toBe('Sommerurlaub');
    expect(absence.createdAt).toBeTruthy();
    expect(absence.updatedAt).toBe(absence.createdAt);
  });

  it('liefert undefined für einen Tag ohne Abwesenheit', async () => {
    expect(await getAbsence('2026-08-11')).toBeUndefined();
  });

  it('überschreibt eine bestehende Abwesenheit für denselben Tag (Upsert statt Duplikat)', async () => {
    const first = await setAbsence('2026-08-11', 'vacation');
    const second = await setAbsence('2026-08-11', 'sick', 'Grippe');

    expect(second.date).toBe(first.date);
    expect(second.type).toBe('sick');
    expect(second.note).toBe('Grippe');
    // createdAt bleibt vom ersten Anlegen erhalten, nur updatedAt ändert sich.
    expect(second.createdAt).toBe(first.createdAt);

    const all = await listAllAbsences();
    expect(all).toHaveLength(1);
  });

  it('trimmt eine leere/Whitespace-Notiz zu undefined', async () => {
    const absence = await setAbsence('2026-08-11', 'timeoff', '   ');
    expect(absence.note).toBeUndefined();
  });
});

describe('removeAbsence', () => {
  it('entfernt eine bestehende Abwesenheit', async () => {
    await setAbsence('2026-08-11', 'vacation');
    await removeAbsence('2026-08-11');
    expect(await getAbsence('2026-08-11')).toBeUndefined();
  });

  it('wirft nicht beim Löschen eines nicht existierenden Tages', async () => {
    await expect(removeAbsence('2026-08-11')).resolves.toBeUndefined();
  });
});

describe('listAbsencesInRange', () => {
  it('liefert nur Abwesenheiten innerhalb des Bereichs, Grenzen inklusive', async () => {
    await setAbsence('2026-07-31', 'vacation');
    await setAbsence('2026-08-01', 'vacation');
    await setAbsence('2026-08-15', 'sick');
    await setAbsence('2026-08-31', 'timeoff');
    await setAbsence('2026-09-01', 'vacation');

    const result = await listAbsencesInRange('2026-08-01', '2026-08-31');
    const dates = result.map((a) => a.date).sort();

    expect(dates).toEqual(['2026-08-01', '2026-08-15', '2026-08-31']);
  });

  it('liefert eine leere Liste, wenn nichts im Bereich liegt', async () => {
    await setAbsence('2026-01-01', 'vacation');
    expect(await listAbsencesInRange('2026-08-01', '2026-08-31')).toEqual([]);
  });
});

describe('listAllAbsences', () => {
  it('liefert alle Abwesenheiten unabhängig vom Datum', async () => {
    await setAbsence('2026-01-01', 'vacation');
    await setAbsence('2027-12-31', 'sick');
    expect(await listAllAbsences()).toHaveLength(2);
  });
});
