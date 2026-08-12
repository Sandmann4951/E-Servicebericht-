<script lang="ts">
  import { getDayStats, type DayStats } from '../lib/db/stats';
  import { navigate } from '../lib/router.svelte';
  import { formatDurationMinutes, todayISODate } from '../lib/utils/date';

  type View = 'tag' | 'monat' | 'jahr';

  let dayStats = $state<DayStats[]>([]);
  let loading = $state(true);
  let view = $state<View>('monat');

  const today = todayISODate();
  let selectedDate = $state(today);
  let selectedMonth = $state(today.slice(0, 7)); // "YYYY-MM"
  let selectedYear = $state(Number(today.slice(0, 4)));

  async function load(): Promise<void> {
    loading = true;
    dayStats = await getDayStats();
    loading = false;
  }

  $effect(() => {
    load();
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

  function productivePercent(stats: DayStats): number {
    if (stats.totalMinutes <= 0) return 0;
    return Math.round((stats.productiveMinutes / stats.totalMinutes) * 100);
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
    <button type="button" class="back" onclick={() => navigate('/')} aria-label="Zurück zur Übersicht">←</button>
    <h1>Statistik</h1>
  </header>

  <div class="tabs" role="tablist" aria-label="Zeitraum wählen">
    <button type="button" class:active={view === 'tag'} onclick={() => (view = 'tag')}>Tag</button>
    <button type="button" class:active={view === 'monat'} onclick={() => (view = 'monat')}>Monat</button>
    <button type="button" class:active={view === 'jahr'} onclick={() => (view = 'jahr')}>Jahr</button>
  </div>

  <div class="content">
    {#if loading}
      <p class="hint">Lade Statistik…</p>
    {:else if view === 'tag'}
      <div class="nav">
        <button type="button" onclick={() => (selectedDate = shiftDate(selectedDate, -1))} aria-label="Vorheriger Tag">
          ‹
        </button>
        <button type="button" class="nav-label" onclick={() => (selectedDate = today)}>
          {formatDateLongDE(selectedDate)}
        </button>
        <button type="button" onclick={() => (selectedDate = shiftDate(selectedDate, 1))} aria-label="Nächster Tag">
          ›
        </button>
      </div>

      {#if dayStat.totalMinutes === 0}
        <p class="empty">Keine Zeiten erfasst für diesen Tag.</p>
      {:else}
        {@render statsCardSnippet(dayStat)}
      {/if}
    {:else if view === 'monat'}
      <div class="nav">
        <button
          type="button"
          onclick={() => (selectedMonth = shiftMonth(selectedMonth, -1))}
          aria-label="Vorheriger Monat"
        >
          ‹
        </button>
        <button type="button" class="nav-label" onclick={() => (selectedMonth = today.slice(0, 7))}>
          {formatMonthDE(selectedMonth)}
        </button>
        <button type="button" onclick={() => (selectedMonth = shiftMonth(selectedMonth, 1))} aria-label="Nächster Monat">
          ›
        </button>
      </div>

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
    {:else}
      <div class="nav">
        <button type="button" onclick={() => (selectedYear -= 1)} aria-label="Vorheriges Jahr">‹</button>
        <button type="button" class="nav-label" onclick={() => (selectedYear = Number(today.slice(0, 4)))}>
          {selectedYear}
        </button>
        <button type="button" onclick={() => (selectedYear += 1)} aria-label="Nächstes Jahr">›</button>
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
    {/if}
  </div>
</div>

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
</style>
