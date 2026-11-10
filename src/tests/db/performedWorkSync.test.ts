import { beforeEach, describe, expect, it } from 'vitest';
import { resetTestDB } from '../testUtils';
import { createReport, finalizeReport, getReport, updateReport } from '../../lib/db/reports';
import { addTimeEntry, deleteTimeEntry, listTimeEntries, updateTimeEntry } from '../../lib/db/timeEntries';
import { syncPerformedWorkFromNotes } from '../../lib/db/performedWorkSync';

beforeEach(async () => {
  await resetTestDB();
});

describe('syncPerformedWorkFromNotes', () => {
  it('übernimmt die Notiz eines laufenden Abschnitts und ersetzt die Zeile beim Auschecken (statt sie doppelt anzuhängen)', async () => {
    const report = await createReport({ projectNumber: 'A', performedWork: 'Erster Einsatz: Leitungen gezogen' });
    const entry = await addTimeEntry(report.id, { date: '2026-08-10', startTime: '08:00' });

    await updateTimeEntry(entry.id, { note: 'Wallbox mon' });
    expect(await syncPerformedWorkFromNotes(report.id)).toBe('Erster Einsatz: Leitungen gezogen\n10.08.2026: Wallbox mon');

    // Weitergetippt: dieselbe Zeile wird aktualisiert.
    await updateTimeEntry(entry.id, { note: 'Wallbox montiert' });
    expect(await syncPerformedWorkFromNotes(report.id)).toBe('Erster Einsatz: Leitungen gezogen\n10.08.2026: Wallbox montiert');

    // Ausgecheckt: jetzt mit Zeitspanne.
    await updateTimeEntry(entry.id, { endTime: '12:00' });
    await syncPerformedWorkFromNotes(report.id);
    expect((await getReport(report.id))?.performedWork).toBe(
      'Erster Einsatz: Leitungen gezogen\n10.08.2026, 08:00–12:00: Wallbox montiert'
    );
  });

  it('ist ohne Änderung wirkungslos (mehrfaches Aufrufen hängt nichts an)', async () => {
    const report = await createReport({ projectNumber: 'A' });
    await addTimeEntry(report.id, { date: '2026-08-10', startTime: '08:00', endTime: '12:00', note: 'Fehlersuche' });
    await syncPerformedWorkFromNotes(report.id);
    await syncPerformedWorkFromNotes(report.id);
    expect((await getReport(report.id))?.performedWork).toBe('10.08.2026, 08:00–12:00: Fehlersuche');
  });

  it('schreibt die Zeilen mehrerer Abschnitte in zeitlicher Reihenfolge und entfernt die Zeile einer geleerten Notiz', async () => {
    const report = await createReport({ projectNumber: 'A' });
    const second = await addTimeEntry(report.id, { date: '2026-08-11', startTime: '08:00', endTime: '10:00', note: 'Zweiter Tag' });
    await addTimeEntry(report.id, { date: '2026-08-10', startTime: '08:00', endTime: '10:00', note: 'Erster Tag' });
    expect(await syncPerformedWorkFromNotes(report.id)).toBe(
      '10.08.2026, 08:00–10:00: Erster Tag\n11.08.2026, 08:00–10:00: Zweiter Tag'
    );

    await updateTimeEntry(second.id, { note: '' });
    expect(await syncPerformedWorkFromNotes(report.id)).toBe('10.08.2026, 08:00–10:00: Erster Tag');
  });

  it('lässt eine vom Monteur umformulierte Zeile in Ruhe, auch wenn sich die Notiz später ändert', async () => {
    const report = await createReport({ projectNumber: 'A' });
    const entry = await addTimeEntry(report.id, { date: '2026-08-10', startTime: '08:00', endTime: '10:00', note: 'Fehlersuche' });
    await syncPerformedWorkFromNotes(report.id);
    await updateReport(report.id, { performedWork: 'Ausführliche Fehlersuche an der Unterverteilung' });

    await updateTimeEntry(entry.id, { note: 'Fehlersuche UV' });
    expect(await syncPerformedWorkFromNotes(report.id)).toBe('Ausführliche Fehlersuche an der Unterverteilung');
  });

  it('verändert einen gesperrten Bericht nicht', async () => {
    const report = await createReport({ projectNumber: 'A', performedWork: 'Fertig' });
    await addTimeEntry(report.id, { date: '2026-08-10', startTime: '08:00', endTime: '10:00', note: 'Nachtrag' });
    await finalizeReport(report.id);
    expect(await syncPerformedWorkFromNotes(report.id)).toBe('Fertig');
    expect((await listTimeEntries(report.id))[0].performedWorkLine).toBeUndefined();
  });

  it('liefert undefined für einen unbekannten Bericht', async () => {
    expect(await syncPerformedWorkFromNotes('does-not-exist')).toBeUndefined();
  });

  it('entfernt beim Löschen eines Zeiteintrags auch dessen Zeile', async () => {
    const report = await createReport({ projectNumber: 'A', performedWork: 'Vorher' });
    const entry = await addTimeEntry(report.id, { date: '2026-08-10', startTime: '08:00', endTime: '10:00', note: 'Versehentlich' });
    await syncPerformedWorkFromNotes(report.id);
    await deleteTimeEntry(entry.id);
    expect((await getReport(report.id))?.performedWork).toBe('Vorher');
  });
});
