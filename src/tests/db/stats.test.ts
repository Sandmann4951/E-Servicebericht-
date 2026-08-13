import { beforeEach, describe, expect, it } from 'vitest';
import { resetTestDB } from '../testUtils';
import { createReport } from '../../lib/db/reports';
import { addTimeEntry } from '../../lib/db/timeEntries';
import { getDayStats } from '../../lib/db/stats';

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
});
