import { beforeEach, describe, expect, it } from 'vitest';
import { resetTestDB } from '../testUtils';
import { createReport } from '../../lib/db/reports';
import { addTimeEntry } from '../../lib/db/timeEntries';
import { getDayBreaks, getDayProjectBreakdown, getDayStats } from '../../lib/db/stats';

beforeEach(async () => {
  await resetTestDB();
});

describe('getDayStats', () => {
  it('liefert eine leere Liste ohne Zeiteinträge', async () => {
    expect(await getDayStats()).toEqual([]);
  });

  it('summiert produktive und Leerlaufzeit getrennt pro Tag', async () => {
    const report = await createReport({ projectNumber: 'A' });
    await addTimeEntry(report.id, { date: '2026-08-10', startTime: '08:00', endTime: '10:00' }); // 120 produktiv
    await addTimeEntry(undefined, { date: '2026-08-10', startTime: '10:00', endTime: '10:30' }); // 30 Leerlauf

    const stats = await getDayStats();

    expect(stats).toEqual([{ date: '2026-08-10', productiveMinutes: 120, idleMinutes: 30, totalMinutes: 150 }]);
  });

  it('summiert mehrere Berichte am selben Tag zu einem einzigen Tageseintrag', async () => {
    const reportA = await createReport({ projectNumber: 'A' });
    const reportB = await createReport({ projectNumber: 'B' });
    await addTimeEntry(reportA.id, { date: '2026-08-11', startTime: '08:00', endTime: '09:00' }); // 60
    await addTimeEntry(reportB.id, { date: '2026-08-11', startTime: '09:00', endTime: '09:45' }); // 45

    const stats = await getDayStats();

    expect(stats).toHaveLength(1);
    expect(stats[0]).toEqual({ date: '2026-08-11', productiveMinutes: 105, idleMinutes: 0, totalMinutes: 105 });
  });

  it('ignoriert Einträge ohne Dauer (noch offene, laufende Session)', async () => {
    const report = await createReport({ projectNumber: 'A' });
    await addTimeEntry(report.id, { date: '2026-08-12', startTime: '08:00' }); // noch offen, keine Dauer

    expect(await getDayStats()).toEqual([]);
  });

  it('zählt eine über Mitternacht laufende Zeitspanne auf dem Start-Datum des Eintrags', async () => {
    const report = await createReport({ projectNumber: 'A' });
    // 19:05 bis 12:16 (nächster Tag), z.B. über Nacht vergessenes Auschecken
    await addTimeEntry(report.id, { date: '2026-08-12', startTime: '19:05', endTime: '12:16' });

    const stats = await getDayStats();

    expect(stats).toEqual([
      { date: '2026-08-12', productiveMinutes: 17 * 60 + 11, idleMinutes: 0, totalMinutes: 17 * 60 + 11 }
    ]);
  });

  it('liefert die Tage sortiert nach Datum aufsteigend, über mehrere Monate hinweg', async () => {
    const report = await createReport({ projectNumber: 'A' });
    await addTimeEntry(report.id, { date: '2026-09-01', startTime: '08:00', endTime: '09:00' });
    await addTimeEntry(report.id, { date: '2026-08-05', startTime: '08:00', endTime: '09:00' });
    await addTimeEntry(report.id, { date: '2026-08-20', startTime: '08:00', endTime: '09:00' });

    const stats = await getDayStats();

    expect(stats.map((s) => s.date)).toEqual(['2026-08-05', '2026-08-20', '2026-09-01']);
  });

  it('zählt einen reinen Leerlaufzeit-Tag korrekt (kein Projekt an dem Tag)', async () => {
    await addTimeEntry(undefined, { date: '2026-08-13', startTime: '08:00', endTime: '08:45' });

    const stats = await getDayStats();

    expect(stats).toEqual([{ date: '2026-08-13', productiveMinutes: 0, idleMinutes: 45, totalMinutes: 45 }]);
  });

  it('ignoriert Pausen-Einträge (isBreak) vollständig - weder produktiv noch Leerlaufzeit', async () => {
    const report = await createReport({ projectNumber: 'A' });
    await addTimeEntry(report.id, { date: '2026-08-14', startTime: '08:00', endTime: '12:00' }); // 240 produktiv
    await addTimeEntry(undefined, { date: '2026-08-14', startTime: '12:00', endTime: '12:30', isBreak: true }); // Pause

    const stats = await getDayStats();

    expect(stats).toEqual([{ date: '2026-08-14', productiveMinutes: 240, idleMinutes: 0, totalMinutes: 240 }]);
  });
});

describe('getDayBreaks', () => {
  it('liefert eine leere Liste ohne Pausen an dem Tag', async () => {
    expect(await getDayBreaks('2026-08-10')).toEqual([]);
  });

  it('liefert nur die Pausen-Einträge, nach Startzeit sortiert', async () => {
    await addTimeEntry(undefined, { date: '2026-08-10', startTime: '08:00', endTime: '12:00' }); // Leerlaufzeit, keine Pause
    await addTimeEntry(undefined, { date: '2026-08-10', startTime: '12:00', endTime: '12:30', isBreak: true });
    await addTimeEntry(undefined, { date: '2026-08-10', startTime: '10:00', endTime: '10:15', isBreak: true });

    const breaks = await getDayBreaks('2026-08-10');

    expect(breaks.map((b) => [b.startTime, b.endTime, b.minutes])).toEqual([
      ['10:00', '10:15', 15],
      ['12:00', '12:30', 30]
    ]);
  });
});

describe('getDayProjectBreakdown', () => {
  it('liefert eine leere Liste ohne Zeiteinträge an dem Tag', async () => {
    expect(await getDayProjectBreakdown('2026-08-10')).toEqual([]);
  });

  it('summiert mehrere Abschnitte im selben Bericht am selben Tag', async () => {
    const report = await createReport({ projectNumber: 'A', customer: 'Müller GmbH' });
    await addTimeEntry(report.id, { date: '2026-08-10', startTime: '08:00', endTime: '10:00' }); // 120
    await addTimeEntry(report.id, { date: '2026-08-10', startTime: '13:00', endTime: '14:30' }); // 90

    const breakdown = await getDayProjectBreakdown('2026-08-10');

    expect(breakdown).toEqual([{ reportId: report.id, projectNumber: 'A', customer: 'Müller GmbH', minutes: 210 }]);
  });

  it('listet mehrere Berichte am selben Tag, absteigend nach Zeit sortiert', async () => {
    const reportA = await createReport({ projectNumber: 'A' });
    const reportB = await createReport({ projectNumber: 'B' });
    await addTimeEntry(reportA.id, { date: '2026-08-11', startTime: '08:00', endTime: '08:30' }); // 30
    await addTimeEntry(reportB.id, { date: '2026-08-11', startTime: '09:00', endTime: '11:00' }); // 120

    const breakdown = await getDayProjectBreakdown('2026-08-11');

    expect(breakdown.map((b) => b.reportId)).toEqual([reportB.id, reportA.id]);
    expect(breakdown.map((b) => b.minutes)).toEqual([120, 30]);
  });

  it('ignoriert Leerlaufzeit-Einträge (kein Bericht zugeordnet)', async () => {
    await addTimeEntry(undefined, { date: '2026-08-12', startTime: '08:00', endTime: '08:45' });

    expect(await getDayProjectBreakdown('2026-08-12')).toEqual([]);
  });

  it('ignoriert Einträge ohne Dauer und an anderen Tagen', async () => {
    const report = await createReport({ projectNumber: 'A' });
    await addTimeEntry(report.id, { date: '2026-08-13', startTime: '08:00' }); // noch offen
    await addTimeEntry(report.id, { date: '2026-08-14', startTime: '08:00', endTime: '09:00' }); // anderer Tag

    expect(await getDayProjectBreakdown('2026-08-13')).toEqual([]);
  });
});
