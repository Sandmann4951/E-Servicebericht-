<script lang="ts">
  import { getDayBreaks, getDayProjectBreakdown, getDayStats, type DayBreak, type DayProjectBreakdown, type DayStats } from '../lib/db/stats';
  import { deleteTimeEntry } from '../lib/db/timeEntries';
  import { listAbsencesInRange, removeAbsence, setAbsence } from '../lib/db/absences';
  import type { Absence, AbsenceType } from '../lib/db/types';
  import { navigate } from '../lib/router.svelte';
  import { formatDurationMinutes, startOfWeekISO, todayISODate } from '../lib/utils/date';
  import { getMonthTarget, type MonthTarget } from '../lib/utils/targetHours';
  import { computeDayStatus, type DayStatus } from '../lib/utils/calendarDay';
  import { getGermanHolidays } from '../lib/utils/holidays';
  import { getBundesland } from '../lib/settings';
  import Icon, { type IconName } from '../lib/components/Icon.svelte';

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

  // Für das Quick-Entry-Panel unter dem Kalendertag: dieselbe Auswahl wie im
  // Abwesenheiten-Screen (Urlaub/Krank/Zeitausgleich), hier aber direkt im
  // Kalender antippbar statt über einen eigenen Screen.
  const ABSENCE_TYPES: AbsenceType[] = ['vacation', 'sick', 'timeoff'];
  const ABSENCE_ICONS: Record<AbsenceType, IconName> = {
    vacation: 'umbrella',
    sick: 'thermometer',
    timeoff: 'refresh-cw'
  };
  // Nur für diese Status ergibt eine Abwesenheits-Schnellerfassung Sinn: ein
  // offener Werktag (kann als Urlaub/Krank/ZA markiert werden) oder ein Tag,
  // der bereits eine Abwesenheit trägt (kann geändert/entfernt werden). Bei
  // Feiertag/Wochenende/bereits gebuchter Zeit gibt's bewusst keine
  // Schnellerfassung - dort würde eine Abwesenheit echte Daten überlagern.
  const QUICK_ABSENCE_STATUSES: DayStatus[] = ['open', 'vacation', 'sick', 'timeoff'];

  let dayStats = $state<DayStats[]>([]);
  let loading = $state(true);
  let view = $state<View>('monat');
  let projectBreakdown = $state<DayProjectBreakdown[]>([]);
  let dayBreaks = $state<DayBreak[]>([]);
  let monthTarget = $state<MonthTarget>({
    targetMinutes: 0,
    workingDays: 0,
    creditedAbsenceDays: 0,
    creditedAbsenceMinutes: 0
  });
  let calendarMode = $state<CalendarMode>('monat');
  let calendarAbsences = $state<Absence[]>([]);
  // Im Kalender-Tab angetippter Tag: statt (wie früher) sofort in den
  // Tag-Reiter zu springen, bleibt man im Kalender und die Tages-Infos
  // klappen direkt darunter auf. Erneutes Antippen desselben Tages klappt
  // wieder zu.
  let selectedCalendarDate = $state<string | undefined>(undefined);
  let calendarDayBreakdown = $state<DayProjectBreakdown[]>([]);

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
    getDayBreaks(selectedDate).then((result) => {
      dayBreaks = result;
    });
  });

  async function removeBreak(breakId: string): Promise<void> {
    // Löscht nur den Pause-Datensatz selbst - die beim Anlegen der Pause
    // gekürzten Nachbar-Einträge (siehe checkOutDay()) werden dabei bewusst
    // NICHT automatisch wiederhergestellt (dieselbe Grenze wie beim
    // bestehenden Überschneidungs-Wegschneiden in TimeEntrySection.svelte,
    // wo ein Rückgängig ebenfalls nicht vorgesehen ist). Wurde die Pause
    // versehentlich falsch eingetragen, kann die betroffene Zeit im
    // Zeiten-Tab des jeweiligen Berichts manuell nachgetragen werden.
    if (!confirm('Pause löschen? Die dadurch gekürzte Zeit wird NICHT automatisch wiederhergestellt.')) return;
    await deleteTimeEntry(breakId);
    dayBreaks = await getDayBreaks(selectedDate);
    await load();
  }

  // Soll-Stunden nur nachladen, solange die Monatsansicht aktiv ist -
  // dieselbe view-Gate-Logik wie bei der Projekt-Aufschlüsselung oben.
  $effect(() => {
    if (view !== 'monat') return;
    getMonthTarget(selectedMonth).then((result) => {
      monthTarget = result;
    });
  });

  function calendarRange(): { start: string; end: string } {
    return calendarMode === 'monat'
      ? { start: `${selectedMonth}-01`, end: `${selectedMonth}-${String(daysInMonth(selectedMonth)).padStart(2, '0')}` }
      : { start: selectedWeekStart, end: shiftDate(selectedWeekStart, 6) };
  }

  async function reloadCalendarAbsences(): Promise<void> {
    const range = calendarRange();
    calendarAbsences = await listAbsencesInRange(range.start, range.end);
  }

  // Abwesenheiten für den sichtbaren Kalender-Zeitraum (Monat oder Woche)
  // nachladen - dieselbe view-Gate-Logik wie oben.
  $effect(() => {
    if (view !== 'kalender') return;
    void reloadCalendarAbsences();
  });

  // Wechselt sich der sichtbare Zeitraum (Monat-/Wochennavigation, Monat-
  // /Woche-Umschalter), schließt das Tages-Panel - sonst würde es einen Tag
  // zeigen, der gar nicht mehr im sichtbaren Raster ist.
  $effect(() => {
    calendarMode;
    selectedMonth;
    selectedWeekStart;
    selectedCalendarDate = undefined;
  });

  // Lädt die Projekt-Aufschlüsselung für den im Kalender aufgeklappten Tag -
  // dasselbe Muster wie oben für die Tag-Ansicht.
  $effect(() => {
    if (view !== 'kalender' || !selectedCalendarDate) {
      calendarDayBreakdown = [];
      return;
    }
    getDayProjectBreakdown(selectedCalendarDate).then((result) => {
      calendarDayBreakdown = result;
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

  const selectedCalendarDayStat = $derived.by(() =>
    selectedCalendarDate
      ? (dayStats.find((d) => d.date === selectedCalendarDate) ?? emptyStats(selectedCalendarDate))
      : emptyStats('')
  );

  const selectedCalendarCell = $derived.by((): CalendarCell | undefined => {
    if (!selectedCalendarDate) return undefined;
    const cells = calendarMode === 'monat' ? calendarMonthCells : calendarWeekCells;
    return cells.find((cell) => cell?.date === selectedCalendarDate) ?? undefined;
  });

  function openDay(date: string): void {
    selectedDate = date;
    view = 'tag';
  }

  function openMonth(ym: string): void {
    selectedMonth = ym;
    view = 'monat';
  }

  /** Klappt die Tages-Infos im Kalender-Tab auf/zu (erneutes Antippen desselben Tages klappt wieder zu). */
  function selectCalendarDay(date: string): void {
    selectedCalendarDate = selectedCalendarDate === date ? undefined : date;
  }

  /**
   * Setzt/wechselt/entfernt die Abwesenheit für einen Tag direkt aus dem
   * Kalender heraus. Bewusst ohne die "schon Zeiten erfasst?"-Rückfrage aus
   * Abwesenheiten.svelte: die Schnellerfassung ist nur für Tage mit Status
   * 'open' oder bereits vorhandener Abwesenheit sichtbar (s. QUICK_ABSENCE_
   * STATUSES) - beides schließt bereits gebuchte Zeit aus (siehe
   * computeDayStatus()-Priorität), die Rückfrage kann also nie greifen.
   */
  async function quickToggleAbsence(date: string, type: AbsenceType): Promise<void> {
    const existing = calendarAbsences.find((a) => a.date === date);
    if (existing?.type === type) {
      await removeAbsence(date);
    } else {
      await setAbsence(date, type);
    }
    await reloadCalendarAbsences();
  }
</script>

<div class="screen">
  <header class="header">
    <button type="button" class="back" onclick={() => navigate('/')} aria-label="Zurück zur Übersicht"><Icon name="back" /></button>
    <h1>Auswertung</h1>
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

      {#if dayBreaks.length > 0}
        <div class="projects">
          <p class="section-title">Pausen</p>
          <ul class="breakdown">
            {#each dayBreaks as brk (brk.id)}
              <li class="break-entry">
                <span class="breakdown-label plain">{brk.startTime}–{brk.endTime} Uhr</span>
                <span class="breakdown-values"><span class="idle">{formatDurationMinutes(brk.minutes)}</span></span>
                <button type="button" class="remove-break-entry" onclick={() => removeBreak(brk.id)} aria-label="Pause löschen">
                  <Icon name="trash" size={16} />
                </button>
              </li>
            {/each}
          </ul>
        </div>
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
                class:selected={cell.date === selectedCalendarDate}
                style:background={STATUS_BG[cell.status]}
                style:color={STATUS_FG[cell.status]}
                onclick={() => selectCalendarDay(cell.date)}
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
              class:selected={cell.date === selectedCalendarDate}
              style:background={STATUS_BG[cell.status]}
              style:color={STATUS_FG[cell.status]}
              onclick={() => selectCalendarDay(cell.date)}
              aria-label="{formatDateLongDE(cell.date)}: {STATUS_LABELS[cell.status]}"
            >
              {cell.dayOfMonth}
            </button>
          {/each}
        </div>
      {/if}

      {#if selectedCalendarDate}
        {@const date = selectedCalendarDate}
        {@const cell = selectedCalendarCell}
        <div class="day-panel">
          <div class="day-panel-header">
            <p class="day-panel-title">{formatDateLongDE(date)}</p>
            <button
              type="button"
              class="day-panel-close"
              onclick={() => (selectedCalendarDate = undefined)}
              aria-label="Tages-Infos schließen"
            >
              <Icon name="close" size={16} />
            </button>
          </div>

          {#if selectedCalendarDayStat.totalMinutes > 0}
            {@render statsCardSnippet(selectedCalendarDayStat)}
            {#if calendarDayBreakdown.length > 0}
              <ul class="breakdown">
                {#each calendarDayBreakdown as project (project.reportId)}
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
            {/if}
            <button type="button" class="day-panel-link" onclick={() => openDay(date)}>Vollständige Tagesansicht öffnen</button>
          {:else if cell?.status === 'holiday'}
            <p class="hint small">Feiertag, keine Zeiten erfasst.</p>
          {:else if cell?.status === 'weekend'}
            <p class="hint small">Wochenende, keine Zeiten erfasst.</p>
          {:else}
            <p class="hint small">Keine Zeiten erfasst.</p>
          {/if}

          {#if cell && QUICK_ABSENCE_STATUSES.includes(cell.status)}
            <div class="type-select" role="radiogroup" aria-label="Abwesenheit für diesen Tag">
              {#each ABSENCE_TYPES as type (type)}
                <button
                  type="button"
                  role="radio"
                  aria-checked={cell.status === type}
                  class:active={cell.status === type}
                  onclick={() => quickToggleAbsence(date, type)}
                >
                  <Icon name={ABSENCE_ICONS[type]} />
                  <span>{STATUS_LABELS[type]}</span>
                </button>
              {/each}
            </div>
            <p class="hint small">Antippen zum Eintragen, erneutes Antippen des aktiven Eintrags entfernt ihn wieder.</p>
          {/if}
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
  {@const effectiveIstMinutes = actual.totalMinutes + target.creditedAbsenceMinutes}
  <div class="stats-card">
    <div class="stats">
      <div class="stat"><strong>{formatDurationMinutes(target.targetMinutes)}</strong><span>Soll</span></div>
      <div class="stat"><strong>{formatDurationMinutes(effectiveIstMinutes)}</strong><span>Ist</span></div>
      <div
        class="stat"
        class:diff-positive={effectiveIstMinutes >= target.targetMinutes}
        class:diff-negative={effectiveIstMinutes < target.targetMinutes}
      >
        <strong>{formatDiffMinutes(effectiveIstMinutes - target.targetMinutes)}</strong><span>Differenz</span>
      </div>
    </div>
    {#if target.creditedAbsenceDays > 0}
      <p class="credit-caption">
        davon {target.creditedAbsenceDays}
        {target.creditedAbsenceDays === 1 ? 'Urlaubs-/Kranktag' : 'Urlaubs-/Kranktage'} angerechnet ({formatDurationMinutes(
          target.creditedAbsenceMinutes
        )})
      </p>
    {/if}
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

  .credit-caption {
    margin: 0;
    text-align: center;
    font-size: 0.78rem;
    color: var(--color-vacation);
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

  .break-entry {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-3);
  }

  .remove-break-entry {
    background: transparent;
    border: none;
    color: var(--color-danger);
    padding: 0 0 0 var(--space-2);
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

  .calendar-cell.selected {
    box-shadow: inset 0 0 0 2px var(--color-text);
  }

  .calendar-cell.today.selected {
    box-shadow:
      inset 0 0 0 2px var(--color-primary),
      inset 0 0 0 4px var(--color-text);
  }

  .day-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    background: var(--color-surface-muted);
    border-radius: var(--radius-md);
    padding: var(--space-3);
  }

  .day-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .day-panel-title {
    margin: 0;
    font-weight: 700;
  }

  .day-panel-close {
    background: transparent;
    border: none;
    padding: var(--space-1);
    min-height: auto;
    color: var(--color-text-muted);
  }

  .day-panel-link {
    background: transparent;
    border: none;
    padding: 0;
    min-height: auto;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--color-primary);
    text-align: left;
  }

  .hint.small {
    margin: 0;
    font-size: 0.82rem;
  }

  .type-select {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-2);
  }

  .type-select button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-2);
    font-size: 0.78rem;
    color: var(--color-text-muted);
    min-height: auto;
  }

  .type-select button.active {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: var(--color-primary-contrast);
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
