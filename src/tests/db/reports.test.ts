import { beforeEach, describe, expect, it } from 'vitest';
import { resetTestDB } from '../testUtils';
import { createReport, deleteReport, getReport, listReports, updateReport } from '../../lib/db/reports';
import { addTimeEntry } from '../../lib/db/timeEntries';

beforeEach(async () => {
  await resetTestDB();
});

describe('reports repository', () => {
  it('erstellt einen Bericht mit initialen Summary-Werten auf 0', async () => {
    const report = await createReport({ projectNumber: '2026-001' });

    expect(report.id).toBeTruthy();
    expect(report.projectNumber).toBe('2026-001');
    expect(report.status).toBe('open');
    expect(report.timeEntryCount).toBe(0);
    expect(report.totalDurationMinutes).toBe(0);
    expect(report.materialItemCount).toBe(0);
    expect(report.photoCount).toBe(0);
  });

  it('speichert Kurzbeschreibung, Ansprechpartner und Notizen bereits beim Anlegen', async () => {
    const report = await createReport({
      projectNumber: '2026-002',
      projectDescription: 'Zählerschrank-Sanierung',
      customer: 'Musterfirma GmbH',
      contactPerson: 'Frau Beispiel',
      technicianName: 'Daniel',
      notes: 'Erstbegehung erfolgt'
    });

    expect(report.projectDescription).toBe('Zählerschrank-Sanierung');
    expect(report.contactPerson).toBe('Frau Beispiel');
    expect(report.notes).toBe('Erstbegehung erfolgt');
  });

  it('listet Berichte nach updatedAt absteigend', async () => {
    const first = await createReport({ projectNumber: 'A' });
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await createReport({ projectNumber: 'B' });

    const reports = await listReports();
    expect(reports.map((r) => r.id)).toEqual([second.id, first.id]);
  });

  it('filtert Berichte nach Status', async () => {
    const open = await createReport({ projectNumber: 'OPEN' });
    const completed = await createReport({ projectNumber: 'DONE' });
    await updateReport(completed.id, { status: 'completed' });

    const openReports = await listReports('open');
    const completedReports = await listReports('completed');

    expect(openReports.map((r) => r.id)).toEqual([open.id]);
    expect(completedReports.map((r) => r.id)).toEqual([completed.id]);
  });

  it('aktualisiert Felder eines Berichts', async () => {
    const report = await createReport({ projectNumber: '1' });
    await new Promise((resolve) => setTimeout(resolve, 2));
    const updated = await updateReport(report.id, { customer: 'Musterfirma GmbH', notes: 'Zählerschrank getauscht' });

    expect(updated?.customer).toBe('Musterfirma GmbH');
    expect(updated?.notes).toBe('Zählerschrank getauscht');
    expect(updated?.updatedAt).not.toBe(report.updatedAt);
  });

  it('liefert undefined beim Update eines nicht existierenden Berichts', async () => {
    const result = await updateReport('does-not-exist', { customer: 'x' });
    expect(result).toBeUndefined();
  });

  it('löscht einen Bericht', async () => {
    const report = await createReport({ projectNumber: '1' });
    await deleteReport(report.id);
    expect(await getReport(report.id)).toBeUndefined();
  });

  it('verliert bei gleichzeitigem updateReport() und Zeiteintrag-Anlage keine der beiden Änderungen', async () => {
    // Regressionstest: updateReport() nutzte früher zwei getrennte
    // Transaktionen (db.get + db.put) statt einer gemeinsamen. Parallel dazu
    // schreibt addTimeEntry() (über recomputeReportSummary) ebenfalls den
    // reports-Datensatz. Ohne gemeinsame Transaktion konnte der zuletzt
    // abgeschlossene Schreibvorgang den anderen überschreiben - z.B. einen
    // Status-Wechsel zurück auf "completed" kippen, obwohl der Nutzer gerade
    // erst auf "open" umgeschaltet hatte.
    const report = await createReport({ projectNumber: '1', notes: 'x' });
    await updateReport(report.id, { status: 'completed' });

    await Promise.all([
      updateReport(report.id, { status: 'open' }),
      addTimeEntry(report.id, { date: '2026-08-11', startTime: '08:00', endTime: '10:00' })
    ]);

    const final = await getReport(report.id);
    expect(final?.status).toBe('open');
    expect(final?.timeEntryCount).toBe(1);
    expect(final?.totalDurationMinutes).toBe(120);
  });
});
