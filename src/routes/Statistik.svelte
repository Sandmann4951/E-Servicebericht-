<script lang="ts">
  import { getDayProjectBreakdown, getDayStats, type DayProjectBreakdown, type DayStats } from '../lib/db/stats';
  import { listAbsencesInRange } from '../lib/db/absences';
  import type { Absence } from '../lib/db/types';
  import { navigate } from '../lib/router.svelte';
  import { formatDurationMinutes, startOfWeekISO, todayISODate } from '../lib/utils/date';
  import { getMonthTarget, type MonthTarget } from '../lib/utils/targetHours';
  import { computeDayStatus, type DayStatus } from '../lib/utils/calendarDay';
  import { getGermanHolidays } from '../lib/utils/holidays';
  import { getBundesland } from '../lib/settings';
  import Icon from '../lib/components/Icon.svelte';

  type View = 'tag' | 'monat' | 'jahr' | 'kalender';
  type CalendarMode = 'monat' | 'woche';

  interface CalendarCell {
    date: string;
    dayOfMonth: number;
    status: DayStatus;
  }

  const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  // Reihenfolge bestimmt auch die Legenden-Reihenfolge in der Kalender-Ansicht.
  const LEGEND_STATUSES: DayStatus[] = ['open', 'booked', 'holiday', 'vacation', 'sick', 'timeoff', 'weekend'];

  const STATUS_BG: Record<DayStatus, string> = {
    vacation: 'var(--color-vacation-bg)',
    sick: 'var(--color-sick-bg)',
    timeoff: 'var(--color-timeoff-bg)',
    holiday: 'var(--color-holiday-bg)',
    booked: 'var(--color-completed-bg)',
    weekend: 'var(--color-surface-muted)',
    open: 'var(--color-open-bg)'
  };

  const STATUS_FG: Record<DayStatus, string> = {
    vacation: 'var(--color-vacation)',
    sick: 'var(--color-sick)',
    timeoff: 'var(--color-timeoff)',
    holiday: 'var(--color-holiday)',
    booked: 'var(--color-completed)',
    weekend: 'var(--color-text-muted)',
    open: 'var(--color-open)'
  };

  const STATUS_LABELS: Record<DayStatus, string> = {
    vacation: 'Urlaub',
    sick: 'Krank',
    timeoff: 'Zeitausgleich',
    holiday: 'Feiertag',
    booked: 'Gebucht',
    weekend: 'Wochenende',
    open: 'Offen'
  };

  let dayStats = $state<DayStats[]>([]);
  let loading = $state(true);
  let view = $state<View>('monat');
  let projectBreakdown = $state<DayProjectBreakdown[]>([]);
  let monthTarget = $state<MonthTarget>({ targetMinutes: 0, workingDays: 0 });
  let calendarMode = $state<CalendarMode>('monat');
  let calendarAbsences = $state<Absence[]>([]);

  const today = todayISODate();
  let selectedDate = $state(today);
  let selectedMonth = $state(today.slice(0, 7)); // "YYYY-MM"
  let selectedYear = $state(Number(today.slice(0, 4)));
  let selectedWeekStart = $state(startOfWeekISO(today));

  async function load(): Promise<void> {
    loading = true;
    dayStats = await getDayStats();
    loading = false;
  }

  $effect(() => {
    load();
  });

  // Lädt die Projekt-Aufschlüsselung neu, sobald die Tag-Ansicht aktiv ist
  // oder sich das gewählte Datum ändert - unabhängig davon, ob man über den
  // "Tag"-Reiter direkt oder per Antippen einer Tages-Zeile aus der
  // Monatsansicht (openDay) dorthin gelangt ist.
  $effect(() => {
    if (view !== 'tag') return;
    getDayProjectBreakdown(selectedDate).then((result) => {
      projectBreakdown = result;
    });
  });

  // Soll-Stunden nur nachladen, solange die Monatsansicht aktiv ist -
  // dieselbe view-Gate-Logik wie bei der Projekt-Aufschlüsselung oben.
  $effect(() => {
    if (view !== 'monat') return;
    getMonthTarget(selectedMonth).then((result) => {
      monthTarget = result;
    });
  });

  // Abwesenheiten für den sichtbaren Kalender-Zeitraum (Monat oder Woche)
  // nachladen - dieselbe view-Gate-Logik wie oben.
  $effect(() => {
    if (view !== 'kalender') return;
    const range =
      calendarMode === 'monat'
        ? { start: `${selectedMonth}-01`, end: `${selectedMonth}-${String(daysInMonth(selectedMonth)).padStart(2, '0')}` }
        : { start: selectedWeekStart, end: shiftDate(selectedWeekStart, 6) };
    listAbsencesInRange(range.start, range.end).then((result) => {
      calendarAbsences = result;
    });
  });

  function emptyStats(date: string): DayStats {
    return { date, productiveMinutes: 0, idleMinutes: 0, totalMinutes: 0 };
  }

  function sumStats(list: DayStats[]): DayStats {
    return list.reduce(
      (acc, d) => ({
        date: '',
        productiveMinutes: acc.productiveMinutes + d.productiveMinutes,
        idleMinutes: acc.idleMinutes + d.idleMinutes,
        totalMinutes: acc.totalMinutes + d.totalMinutes
      }),
      emptyStats('')
    );
  }

  function shiftDate(iso: string, deltaDays: number): string {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + deltaDays);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }

  function daysInMonth(ym: string): number {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  }

  function shiftMonth(ym: string, deltaMonths: number): string {
    const [y, m] = ym.split('-').map(Number);
    const total = y * 12 + (m - 1) + deltaMonths;
    const yy = Math.floor(total / 12);
    const mm = (total % 12) + 1;
    return `${yy}-${String(mm).padStart(2, '0')}`;
  }

  function formatDateLongDE(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('de-DE', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  function formatMonthDE(ym: string): string {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  }

  function formatMonthShortDE(ym: string): string {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('de-DE', { month: 'short' });
  }

  /** Formatiert eine Kalenderwoche als "10.–16. Aug 2026" (Montag bis Sonntag). */
  function formatWeekRangeDE(start: string): string {
    const end = shiftDate(start, 6);
    const [sy, sm, sd] = start.split('-').map(Number);
    const [ey, em, ed] = end.split('-').map(Number);
    const startLabel = new Date(sy, sm - 1, sd).toLocaleDateString('de-DE', { day: '2-digit' });
    const endLabel = new Date(ey, em - 1, ed).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
    return `${startLabel}.–${endLabel}`;
  }

  function productivePercent(stats: DayStats): number {
    if (stats.totalMinutes <= 0) return 0;
    return Math.round((stats.productiveMinutes / stats.totalMinutes) * 100);
  }

  /** Formatiert eine Minuten-Differenz mit vorangestelltem Vorzeichen, z.B. "+3:15 Std." oder "-1:30 Std.". */
  function formatDiffMinutes(diffMinutes: number): string {
    const sign = diffMinutes < 0 ? '-' : '+';
    return `${sign}${formatDurationMinutes(Math.abs(diffMinutes))}`;
  }

  const dayStat = $derived.by(() => dayStats.find((d) => d.date === selectedDate) ?? emptyStats(selectedDate));

  const monthDays = $derived.by(() =>
    dayStats.filter((d) => d.date.startsWith(selectedMonth)).sort((a, b) => a.date.localeCompare(b.date))
  );
  const monthTotal = $derived.by(() => sumStats(monthDays));

  const yearMonths = $derived.by(() => {
    const map = new Map<string, DayStats>();
    for (const d of dayStats) {
      if (!d.date.startsWith(String(selectedYear))) continue;
      const ym = d.date.slice(0, 7);
      let stats = map.get(ym);
      if (!stats) {
        stats = emptyStats(ym);
        map.set(ym, stats);
      }
      stats.productiveMinutes += d.productiveMinutes;
      stats.idleMinutes += d.idleMinutes;
      stats.totalMinutes += d.totalMinutes;
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  });
  const yearTotal = $derived.by(() => sumStats(yearMonths));

  // Monatsraster für die Kalender-Ansicht: führende `null`-Zellen füllen die
  // erste Woche auf Montag-Start auf (typisches Kalenderlayout), danach ein
  // Eintrag pro Tag des Monats. Keine trainierenden Blindzellen am Ende -
  // die letzte Reihe darf im CSS-Grid einfach kürzer enden.
  const calendarMonthCells = $derived.by((): (CalendarCell | null)[] => {
    if (view !== 'kalender' || calendarMode !== 'monat') return [];
    const [year, month] = selectedMonth.split('-').map(Number);
    const totalDays = daysInMonth(selectedMonth);
    const firstWeekday = new Date(year, month - 1, 1).getDay(); // 0=So, 1=Mo, ...
    const leadingBlanks = firstWeekday === 0 ? 6 : firstWeekday - 1;

    const absenceByDate = new Map(calendarAbsences.map((a) => [a.date, a.type]));
    const statsByDate = new Map(dayStats.map((d) => [d.date, d]));
    const holidays = getGermanHolidays(year, getBundesland());

    const cells: (CalendarCell | null)[] = Array.from({ length: leadingBlanks }, () => null);
    for (let day = 1; day <= totalDays; day++) {
      const date = `${selectedMonth}-${String(day).padStart(2, '0')}`;
      cells.push({
        date,
        dayOfMonth: day,
        status: computeDayStatus({
          date,
          isHoliday: holidays.has(date),
          absenceType: absenceByDate.get(date),
          hasBookedTime: (statsByDate.get(date)?.totalMinutes ?? 0) > 0
        })
      });
    }
    return cells;
  });

  // Wochenraster: immer genau 7 Tage ab selectedWeekStart (Montag). Kann über
  // einen Jahreswechsel laufen (z.B. 29.12.-04.01.) - Feiertage für beide
  // betroffenen Jahre laden und zusammenführen.
  const calendarWeekCells = $derived.by((): CalendarCell[] => {
    if (view !== 'kalender' || calendarMode !== 'woche') return [];
    const absenceByDate = new Map(calendarAbsences.map((a) => [a.date, a.type]));
    const statsByDate = new Map(dayStats.map((d) => [d.date, d]));

    const bundesland = getBundesland();
    const startYear = Number(selectedWeekStart.slice(0, 4));
    const endYear = Number(shiftDate(selectedWeekStart, 6).slice(0, 4));
    const holidays = getGermanHolidays(startYear, bundesland);
    if (endYear !== startYear) {
      for (const [date, name] of getGermanHolidays(endYear, bundesland)) holidays.set(date, name);
    }

    const cells: CalendarCell[] = [];
    for (let i = 0; i < 7; i++) {
      const date = shiftDate(selectedWeekStart, i);
      cells.push({
        date,
        dayOfMonth: Number(date.slice(8, 10)),
        status: computeDayStatus({
          date,
          isHoliday: holidays.has(date),
          absenceType: absenceByDate.get(date),
          hasBookedTime: (statsByDate.get(date)?.totalMinutes ?? 0) > 0
        })
      });
    }
    return cells;
  });

  function openDay(date: string): void {
    selectedDate = date;
    view = 'tag';
  }

  function openMonth(ym: string): void {
    selectedMonth = ym;
    view = 'monat';
  }
</script>

<div class="screen">
  <header class="header">
    <button type="button" class="back" onclick={() => navigate('/')} aria-label="Zurück zur Übersicht"><Icon name="back" /></button>
    <h1>Statistik</h1>
  </header>

  <div class="tabs" role="tablist" aria-label="Zeitraum wählen">
    <button type="button" class:active={view === 'tag'} onclick={() => (view = 'tag')}>Tag</button>
    <button type="button" class:active={view === 'monat'} onclick={() => (view = 'monat')}>Monat</button>
    <button type="button" class:active={view === 'jahr'} onclick={() => (view = 'jahr')}>Jahr</button>
    <button type="button" class:active={view === 'kalender'} onclick={() => (view = 'kalender')}>Kalender</button>
  </div>

  <div class="content">
    {#if loading}
      <p class="hint">Lade Statistik…</p>
    {:else if view === 'tag'}
      <div class="nav">
        <button type="button" onclick={() => (selectedDate = shiftDate(selectedDate, -1))} aria-label="Vorheriger Tag">
          <Icon name="chevron-left" />
        </button>
        <button type="button" class="nav-label" onclick={() => (selectedDate = today)}>
          {formatDateLongDE(selectedDate)}
        </button>
        <button type="button" onclick={() => (selectedDate = shiftDate(selectedDate, 1))} aria-label="Nächster Tag">
          <Icon name="chevron-right" />
        </button>
      </div>

      {#if dayStat.totalMinutes === 0}
        <p class="empty">Keine Zeiten erfasst für diesen Tag.</p>
      {:else}
        {@render statsCardSnippet(dayStat)}

        {#if projectBreakdown.length > 0}
          <div class="projects">
            <p class="section-title">Projekte an diesem Tag</p>
            <ul class="breakdown">
              {#each projectBreakdown as project (project.reportId)}
                <li>
                  <button type="button" class="breakdown-row" onclick={() => navigate(`/reports/${project.reportId}`)}>
                    <span class="breakdown-label plain">
                      {project.projectNumber}{#if project.customer} · {project.customer}{/if}
                    </span>
                    <span class="breakdown-values">
                      <span class="productive">{formatDurationMinutes(project.minutes)}</span>
                    </span>
                  </button>
                </li>
              {/each}
            </ul>
          </div>
        {:else if dayStat.productiveMinutes === 0}
          <p class="hint">Nur Leerlaufzeit an diesem Tag, keine Projektzeiten.</p>
        {/if}
      {/if}
    {:else if view === 'monat'}
      <div class="nav">
        <button
          type="button"
          onclick={() => (selectedMonth = shiftMonth(selectedMonth, -1))}
          aria-label="Vorheriger Monat"
        >
          <Icon name="chevron-left" />
        </button>
        <button type="button" class="nav-label" onclick={() => (selectedMonth = today.slice(0, 7))}>
          {formatMonthDE(selectedMonth)}
        </button>
        <button type="button" onclick={() => (selectedMonth = shiftMonth(selectedMonth, 1))} aria-label="Nächster Monat">
          <Icon name="chevron-right" />
        </button>
      </div>

      {#if monthTarget.workingDays > 0}
        {@render targetCardSnippet(monthTarget, monthTotal)}
      {/if}

      {#if monthTotal.totalMinutes === 0}
        <p class="empty">Keine Zeiten erfasst für diesen Monat.</p>
      {:else}
        {@render statsCardSnippet(monthTotal)}
        <ul class="breakdown">
          {#each monthDays as day (day.date)}
            <li>
              <button type="button" class="breakdown-row" onclick={() => openDay(day.date)}>
                <span class="breakdown-label">{formatDateLongDE(day.date)}</span>
                <span class="breakdown-values">
                  <span class="productive">{formatDurationMinutes(day.productiveMinutes)}</span>
                  <span class="idle">{formatDurationMinutes(day.idleMinutes)}</span>
                </span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    {:else if view === 'jahr'}
      <div class="nav">
        <button type="button" onclick={() => (selectedYear -= 1)} aria-label="Vorheriges Jahr"><Icon name="chevron-left" /></button>
        <button type="button" class="nav-label" onclick={() => (selectedYear = Number(today.slice(0, 4)))}>
          {selectedYear}
        </button>
        <button type="button" onclick={() => (selectedYear += 1)} aria-label="Nächstes Jahr"><Icon name="chevron-right" /></button>
      </div>

      {#if yearTotal.totalMinutes === 0}
        <p class="empty">Keine Zeiten erfasst für dieses Jahr.</p>
      {:else}
        {@render statsCardSnippet(yearTotal)}
        <ul class="breakdown">
          {#each yearMonths as month (month.date)}
            <li>
              <button type="button" class="breakdown-row" onclick={() => openMonth(month.date)}>
                <span class="breakdown-label">{formatMonthShortDE(month.date)}</span>
                <span class="breakdown-values">
                  <span class="productive">{formatDurationMinutes(month.productiveMinutes)}</span>
                  <span class="idle">{formatDurationMinutes(month.idleMinutes)}</span>
                </span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    {:else}
      <div class="calendar-toggle" role="tablist" aria-label="Kalender-Ansicht wählen">
        <button type="button" class:active={calendarMode === 'monat'} onclick={() => (calendarMode = 'monat')}>
          Monat
        </button>
        <button type="button" class:active={calendarMode === 'woche'} onclick={() => (calendarMode = 'woche')}>
          Woche
        </button>
      </div>

      {#if calendarMode === 'monat'}
        <div class="nav">
          <button
            type="button"
            onclick={() => (selectedMonth = shiftMonth(selectedMonth, -1))}
            aria-label="Vorheriger Monat"
          >
            <Icon name="chevron-left" />
          </button>
          <button type="button" class="nav-label" onclick={() => (selectedMonth = today.slice(0, 7))}>
            {formatMonthDE(selectedMonth)}
          </button>
          <button
            type="button"
            onclick={() => (selectedMonth = shiftMonth(selectedMonth, 1))}
            aria-label="Nächster Monat"
          >
            <Icon name="chevron-right" />
          </button>
        </div>

        <div class="calendar-grid">
          {#each WEEKDAY_LABELS as label (label)}
            <div class="calendar-weekday">{label}</div>
          {/each}
          {#each calendarMonthCells as cell, i (cell?.date ?? `blank-${i}`)}
            {#if cell}
              <button
                type="button"
                class="calendar-cell"
                class:today={cell.date === today}
                style:background={STATUS_BG[cell.status]}
                style:color={STATUS_FG[cell.status]}
                onclick={() => openDay(cell.date)}
                aria-label="{formatDateLongDE(cell.date)}: {STATUS_LABELS[cell.status]}"
              >
                {cell.dayOfMonth}
              </button>
            {:else}
              <div class="calendar-cell blank" aria-hidden="true"></div>
            {/if}
          {/each}
        </div>
      {:else}
        <div class="nav">
          <button
            type="button"
            onclick={() => (selectedWeekStart = shiftDate(selectedWeekStart, -7))}
            aria-label="Vorherige Woche"
          >
            <Icon name="chevron-left" />
          </button>
          <button type="button" class="nav-label" onclick={() => (selectedWeekStart = startOfWeekISO(today))}>
            {formatWeekRangeDE(selectedWeekStart)}
          </button>
          <button
            type="button"
            onclick={() => (selectedWeekStart = shiftDate(selectedWeekStart, 7))}
            aria-label="Nächste Woche"
          >
            <Icon name="chevron-right" />
          </button>
        </div>

        <div class="calendar-grid">
          {#each WEEKDAY_LABELS as label (label)}
            <div class="calendar-weekday">{label}</div>
          {/each}
          {#each calendarWeekCells as cell (cell.date)}
            <button
              type="button"
              class="calendar-cell"
              class:today={cell.date === today}
              style:background={STATUS_BG[cell.status]}
              style:color={STATUS_FG[cell.status]}
              onclick={() => openDay(cell.date)}
              aria-label="{formatDateLongDE(cell.date)}: {STATUS_LABELS[cell.status]}"
            >
              {cell.dayOfMonth}
            </button>
          {/each}
        </div>
      {/if}

      <ul class="legend">
        {#each LEGEND_STATUSES as status (status)}
          <li>
            <span class="legend-dot" style:background={STATUS_FG[status]}></span>
            {STATUS_LABELS[status]}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

{#snippet targetCardSnippet(target: MonthTarget, actual: DayStats)}
  <div class="stats-card">
    <div class="stats">
      <div class="stat"><strong>{formatDurationMinutes(target.targetMinutes)}</strong><span>Soll</span></div>
      <div class="stat"><strong>{formatDurationMinutes(actual.totalMinutes)}</strong><span>Ist</span></div>
      <div
        class="stat"
        class:diff-positive={actual.totalMinutes >= target.targetMinutes}
        class:diff-negative={actual.totalMinutes < target.targetMinutes}
      >
        <strong>{formatDiffMinutes(actual.totalMinutes - target.targetMinutes)}</strong><span>Differenz</span>
      </div>
    </div>
  </div>
{/snippet}

{#snippet statsCardSnippet(stats: DayStats)}
  <div class="stats-card">
    <div class="stats">
      <div class="stat"><strong>{formatDurationMinutes(stats.totalMinutes)}</strong><span>Gesamt</span></div>
      <div class="stat productive-stat">
        <strong>{formatDurationMinutes(stats.productiveMinutes)}</strong><span>Produktiv</span>
      </div>
      <div class="stat idle-stat">
        <strong>{formatDurationMinutes(stats.idleMinutes)}</strong><span>Leerlaufzeit</span>
      </div>
    </div>
    <div class="split-bar" role="img" aria-label="{productivePercent(stats)}% produktiv">
      <span class="split-productive" style:width="{productivePercent(stats)}%"></span>
      <span class="split-idle" style:width="{100 - productivePercent(stats)}%"></span>
    </div>
    <p class="split-caption">{productivePercent(stats)}% produktiv</p>
  </div>
{/snippet}

<style>
  .screen {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: calc(var(--space-3) + var(--safe-top)) var(--space-3) var(--space-3);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface);
  }

  .header h1 {
    flex: 1;
    margin: 0;
    font-size: 1.1rem;
  }

  .back {
    background: transparent;
    border: none;
    font-size: 1.2rem;
    padding: var(--space-2);
    min-height: auto;
  }

  .tabs {
    display: flex;
    border-bottom: 1px solid var(--color-border);
    padding: 0 var(--space-2);
    background: var(--color-surface);
  }

  .tabs button {
    flex: 1;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    padding: var(--space-3);
    color: var(--color-text-muted);
    font-weight: 600;
    min-height: auto;
  }

  .tabs button.active {
    color: var(--color-primary);
    border-bottom-color: var(--color-primary);
  }

  .content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4);
    padding-bottom: calc(var(--space-6) + var(--safe-bottom));
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .nav {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .nav > button:first-child,
  .nav > button:last-child {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    min-height: 40px;
    width: 40px;
    font-size: 1.1rem;
  }

  .nav-label {
    flex: 1;
    background: transparent;
    border: none;
    font-weight: 700;
    font-size: 1.05rem;
    text-align: center;
    text-transform: capitalize;
    min-height: auto;
  }

  .hint,
  .empty {
    color: var(--color-text-muted);
    text-align: center;
    margin-top: var(--space-6);
  }

  .stats-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-2);
  }

  .stat {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .stat strong {
    font-size: 1.05rem;
  }

  .stat span {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .productive-stat strong {
    color: var(--color-completed);
  }

  .idle-stat strong {
    color: var(--color-open);
  }

  .diff-positive strong {
    color: var(--color-completed);
  }

  .diff-negative strong {
    color: var(--color-danger);
  }

  .split-bar {
    display: flex;
    height: 10px;
    border-radius: 999px;
    overflow: hidden;
    background: var(--color-surface-muted);
  }

  .split-productive {
    background: var(--color-completed);
  }

  .split-idle {
    background: var(--color-open);
  }

  .split-caption {
    margin: 0;
    text-align: center;
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  .projects {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .section-title {
    margin: 0;
    font-weight: 700;
    font-size: 0.9rem;
    color: var(--color-text-muted);
  }

  .breakdown {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .breakdown-row {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    text-align: left;
    min-height: auto;
  }

  .breakdown-label {
    font-weight: 600;
    text-transform: capitalize;
  }

  .breakdown-label.plain {
    text-transform: none;
  }

  .breakdown-values {
    display: flex;
    gap: var(--space-3);
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .breakdown-values .productive {
    color: var(--color-completed);
  }

  .breakdown-values .idle {
    color: var(--color-open);
  }

  .calendar-toggle {
    display: flex;
    gap: var(--space-2);
    background: var(--color-surface-muted);
    border-radius: var(--radius-sm);
    padding: 4px;
  }

  .calendar-toggle button {
    flex: 1;
    background: transparent;
    border: none;
    border-radius: calc(var(--radius-sm) - 2px);
    padding: var(--space-2);
    min-height: auto;
    font-weight: 600;
    color: var(--color-text-muted);
  }

  .calendar-toggle button.active {
    background: var(--color-surface);
    color: var(--color-text);
    box-shadow: 0 1px 2px var(--color-shadow);
  }

  .calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
  }

  .calendar-weekday {
    text-align: center;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--color-text-muted);
    padding-bottom: 2px;
  }

  .calendar-cell {
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: var(--radius-sm);
    font-size: 0.85rem;
    font-weight: 600;
    min-height: auto;
    padding: 0;
  }

  .calendar-cell.blank {
    background: transparent;
  }

  .calendar-cell.today {
    box-shadow: inset 0 0 0 2px var(--color-primary);
  }

  .legend {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-4);
  }

  .legend li {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: 0.78rem;
    color: var(--color-text-muted);
  }

  .legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    flex-shrink: 0;
  }
</style>
