import { getReport } from './db/reports';
import { addTimeEntry, getGloballyActiveTimeEntry, updateTimeEntry } from './db/timeEntries';
import { nowHHmm, todayISODate } from './utils/date';

/**
 * Stempelt in den angegebenen Bericht ein - stellt sicher, dass eine
 * eventuell anderswo laufende Stempel-Session vorher sauber beendet wird
 * (nach Rückfrage), da man nie in mehreren Berichten gleichzeitig
 * eingestempelt sein soll. Wird sowohl von TimeClock.svelte (Einstempeln-
 * Button im Bericht) als auch vom "Direkt einstempeln"-Schnellzugriff in der
 * Berichtsliste genutzt - eine Stelle für diese Logik statt zwei.
 *
 * @returns true, wenn eingestempelt wurde; false, wenn der Nutzer die
 * Rückfrage zum Beenden der anderen Session abgelehnt hat.
 */
export async function clockInToReport(reportId: string): Promise<boolean> {
  const otherActive = await getGloballyActiveTimeEntry();
  if (otherActive && otherActive.reportId !== reportId) {
    const otherReport = await getReport(otherActive.reportId);
    const label = otherReport?.projectNumber ?? 'einem anderen Bericht';
    const confirmed = confirm(
      `Du bist noch in "${label}" eingestempelt (seit ${otherActive.startTime}). Dort jetzt ausstempeln und hier neu einstempeln?`
    );
    if (!confirmed) return false;
    await updateTimeEntry(otherActive.id, { endTime: nowHHmm() });
  }
  await addTimeEntry(reportId, { date: todayISODate(), startTime: nowHHmm() });
  return true;
}
