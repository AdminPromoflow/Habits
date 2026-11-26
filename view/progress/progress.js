const PROGRESS_PERIODS = ['day', 'week', 'month', 'year'];

function progressState() {
  return S.progress ||= { period: 'week', date: today(), category: '', bucket: '' };
}

function progressRange(period, date) {
  let start = date, end = date;
  if (period === 'week') { start = monday(date); end = shift(start, 6); }
  if (period === 'month') {
    start = date.slice(0, 7) + '-01';
    const next = dateObj(start); next.setUTCMonth(next.getUTCMonth() + 1);
    end = shift(iso(next), -1);
  }
  if (period === 'year') { start = date.slice(0, 4) + '-01-01'; end = date.slice(0, 4) + '-12-31'; }
  return { start, end };
}

function progressMoveDate(period, date, direction) {
  const { start } = progressRange(period, date);
  if (period === 'day' || period === 'week') return shift(start, direction * (period === 'week' ? 7 : 1));
  const next = dateObj(start);
  if (period === 'month') next.setUTCMonth(next.getUTCMonth() + direction);
  else next.setUTCFullYear(next.getUTCFullYear() + direction);
  return iso(next);
}

function progressSummary(records) {
  const total = records.length, completed = records.filter(record => record.completed).length;
  // Rounding must never report 100% while an activity is still pending.
  const percent = total ? Math.min(completed === total ? 100 : 99, Math.round(100 * completed / total)) : null;
  return { total, completed, pending: total - completed, percent };
}

// Use the same recurrence rules and personal completion records as My day to day.
// Index completions once so a year does not scan the full history for every activity.
function progressReport(period, date, categoryId = '', data = S.data) {
  const { start, end } = progressRange(period, date), cutoff = data.today || today();
  const habitLogs = new Map((data.completions || []).map(c => [`${c.habit_id}:${c.completed_on}`, c]));
  const taskLogs = new Set((data.calendar?.completions || []).map(c => `${c.task_id}:${c.completed_on}`));
  const catalog = new Map([...(data.category_catalog || []), ...(data.categories || [])].map(c => [String(c.id), c]));
  const activities = [
    ...(data.habits || []).filter(h => h.permission !== 'viewer').map(h => ({ ...h, kind: 'habit' })),
    ...(data.calendar?.tasks || []).map(task => ({ ...task, kind: 'task' })),
  ];
  const categories = new Map();
  for (const entry of activities) {
    const key = String(entry.category_id || 'none'), category = catalog.get(key);
    const rawColor = category?.color || entry.color;
    categories.set(key, { key, name: (category ? categoryName(category) : habitCategory(entry)) || t('planner_no_category'), color: /^#[0-9a-f]{6}$/i.test(rawColor || '') ? rawColor : '#B8A4D4' });
  }
  const records = [];
  const selected = activities.filter(entry => !categoryId || String(entry.category_id || 'none') === categoryId);
  for (let day = start; day <= end && day <= cutoff; day = shift(day, 1)) {
    for (const entry of selected) {
      const log = entry.kind === 'habit' ? habitLogs.get(`${entry.id}:${day}`) : null;
      // Archived habits have no archive date: retain recorded days, never invent missed days.
      if (entry.kind === 'habit' && entry.status === 'archived' && !log) continue;
      if (!scheduled(entry, day)) continue;
      records.push({ entry, date: day, category: categories.get(String(entry.category_id || 'none')), completed: entry.kind === 'habit' ? !!log && Number(log.amount) >= Number(log.goal_at_time) : taskLogs.has(`${entry.id}:${day}`) });
    }
  }
  const categoryStats = [...categories.values()].map(category => {
    const items = records.filter(r => r.category.key === category.key);
    return { ...category, records: items, ...progressSummary(items) };
  }).filter(category => category.total);
  const buckets = [];
  if (period === 'day') {
    for (const category of categoryStats) buckets.push({ key: category.key, label: category.name, title: category.name, records: category.records, future: false });
  } else if (period === 'year') {
    for (let month = 1; month <= 12; month++) {
      const monthDate = `${start.slice(0, 4)}-${String(month).padStart(2, '0')}-01`;
      buckets.push({ key: monthDate.slice(0, 7), label: fmt(monthDate, { month: 'short' }), title: fmt(monthDate, { month: 'long', year: 'numeric' }), records: records.filter(r => r.date.slice(0, 7) === monthDate.slice(0, 7)), future: monthDate > cutoff });
    }
  } else {
    for (let day = start; day <= end; day = shift(day, 1)) {
      buckets.push({ key: day, label: period === 'week' ? fmt(day, { weekday: 'short' }) : String(Number(day.slice(8))), subtitle: period === 'week' ? fmt(day, { day: 'numeric', month: 'short' }) : '', title: fmt(day, { dateStyle: 'full' }), records: records.filter(r => r.date === day), future: day > cutoff });
    }
  }
  return { start, end, records, categories: [...categories.values()], categoryStats, ...progressSummary(records), buckets: buckets.map(bucket => ({ ...bucket, ...progressSummary(bucket.records) })) };
}

function progressPeriodLabel(period, report) {
  if (period === 'day') return fmt(report.start, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (period === 'month') return fmt(report.start, { month: 'long', year: 'numeric' });
  if (period === 'year') return report.start.slice(0, 4);
  return `${fmt(report.start, { day: 'numeric', month: 'short', year: 'numeric' })} – ${fmt(report.end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function progressChart(report, state, selected) {
  if (!report.buckets.length) return `<div class="progress-empty">${icon('progress')}<h3>${t('progress_empty_title')}</h3><p>${t('progress_empty_hint')}</p></div>`;
  const minWidth = Math.max(240, report.buckets.length * (state.period === 'day' ? 120 : state.period === 'week' ? 78 : 43));
  return `<div class="progress-chart" aria-label="${esc(t('progress_chart_title'))}">
    <div class="progress-y-axis" aria-hidden="true">${[100, 75, 50, 25, 0].map(n => `<span>${n}%</span>`).join('')}</div>
    <div class="progress-chart-scroll"><div class="progress-plot" style="--plot-min:${minWidth}px;--bar-count:${report.buckets.length}">
      <div class="progress-gridlines" aria-hidden="true">${[100, 75, 50, 25, 0].map(n => `<i class="${n === 100 ? 'is-target' : ''}"></i>`).join('')}</div>
      ${report.buckets.map(bucket => {
        const description = `${bucket.title}: ${bucket.future ? t('progress_future') : bucket.total ? t('progress_bar_description', { completed: bucket.completed, total: bucket.total, percent: bucket.percent }) : t('progress_no_scheduled')}`;
        const segments = report.categoryStats.map(category => {
          const count = bucket.records.filter(r => r.completed && r.category.key === category.key).length;
          return count ? `<i style="height:${100 * count / bucket.total}%;background:${category.color}"></i>` : '';
        }).join('');
        return `<button type="button" class="progress-column ${bucket.key === selected?.key ? 'is-selected' : ''} ${bucket.future ? 'is-future' : ''} ${!bucket.total ? 'is-empty' : ''}" data-action="progress-bucket" data-bucket="${esc(bucket.key)}" aria-pressed="${bucket.key === selected?.key}" aria-controls="progress-detail" aria-label="${esc(description)}" title="${esc(description)}">
          <span class="progress-bar-value">${bucket.percent === null ? '—' : bucket.percent + '%'}</span>
          <span class="progress-bar-track" aria-hidden="true">${segments}</span>
          <span class="progress-bar-label">${esc(bucket.label)}</span>${bucket.subtitle ? `<small>${esc(bucket.subtitle)}</small>` : ''}
        </button>`;
      }).join('')}
    </div></div>
  </div>`;
}

function progressDetail(bucket) {
  if (!bucket?.total) return `<div class="progress-detail-empty">${icon('calendar')}<p>${t(bucket?.future ? 'progress_future_hint' : 'progress_no_scheduled')}</p></div>`;
  const groups = new Map();
  for (const record of bucket.records) {
    const key = `${record.entry.kind}:${record.entry.id}`;
    if (!groups.has(key)) groups.set(key, { ...record, total: 0, completed: 0 });
    const item = groups.get(key); item.total++; if (record.completed) item.completed++;
  }
  const items = [...groups.values()].sort((a, b) => Number(a.completed === a.total) - Number(b.completed === b.total) || a.entry.name.localeCompare(b.entry.name));
  return `<div class="progress-task-list">${items.map(item => `<article class="progress-task ${item.completed === item.total ? 'is-complete' : ''}">
    <span class="progress-task-check" aria-hidden="true">${icon(item.completed === item.total ? 'check' : 'clock')}</span>
    <div class="progress-task-name"><strong>${esc(item.entry.name)}</strong><span><i class="progress-swatch" style="background:${item.category.color}"></i>${esc(item.category.name)}<span aria-hidden="true"> · </span>${t('planner_' + item.entry.kind)}</span></div>
    <div class="progress-task-result"><strong>${item.completed} / ${item.total}</strong><span>${t(item.completed === item.total ? 'progress_completed' : item.completed ? 'progress_in_progress' : 'progress_pending')}</span></div>
  </article>`).join('')}</div>`;
}

function progressPage() {
  const state = progressState();
  let report = progressReport(state.period, state.date, state.category);
  if (state.category && !report.categories.some(category => category.key === state.category)) {
    state.category = ''; state.bucket = '';
    report = progressReport(state.period, state.date);
  }
  const currentKey = state.period === 'year' ? state.date.slice(0, 7) : state.date;
  const selected = report.buckets.find(b => b.key === state.bucket) || report.buckets.find(b => b.key === currentKey) || report.buckets.find(b => b.total) || report.buckets[0];
  state.bucket = selected?.key || '';
  const title = progressPeriodLabel(state.period, report), percentage = report.percent === null ? '—' : report.percent + '%';
  return renderTemplate('progress', {
    heading: heading(t('progress'), t('progress_dashboard_subtitle'), badge('private')),
    tabs: PROGRESS_PERIODS.map(period => `<button id="progress-tab-${period}" role="tab" aria-selected="${period === state.period}" aria-controls="progress-panel" tabindex="${period === state.period ? 0 : -1}" class="${period === state.period ? 'selected' : ''}" data-action="progress-period" data-period="${period}">${t('planner_' + period)}</button>`).join(''),
    tabsLabel: t('progress_periods'), activeTab: `progress-tab-${state.period}`,
    controls: `<div class="progress-date-navigation"><button class="icon-btn" data-action="progress-prev" aria-label="${esc(t('previous'))}">${icon('chevron', 'flip')}</button><label class="progress-date-picker"><span>${esc(title)}</span><input id="progress-date" type="date" value="${state.date}" min="1900-01-01" max="9998-12-31" aria-label="${esc(t('select_date'))}">${icon('calendar')}</label><button class="icon-btn" data-action="progress-next" aria-label="${esc(t('next'))}">${icon('chevron')}</button></div><button class="btn secondary" data-action="progress-today">${t('today')}</button>`,
    overview: `<div class="progress-overview-copy"><span class="progress-eyebrow">${t('progress_your_pace')}</span><h2>${t(report.total && report.pending === 0 ? 'progress_all_done' : 'progress_keep_going')}</h2><p>${t('progress_summary', { completed: report.completed, total: report.total })}</p><div class="progress-quick-stats"><span><strong>${report.completed}</strong>${t('progress_completed')}</span><span><strong>${report.pending}</strong>${t('progress_pending')}</span><span><strong>${report.total}</strong>${t('progress_scheduled')}</span></div></div><div class="progress-score" style="--score:${report.percent || 0}%" role="img" aria-label="${esc(t('completion_rate') + ': ' + percentage)}"><div><strong>${percentage}</strong><span>${t('progress_achieved')}</span></div></div>`,
    chartTitle: t('progress_chart_title'), chartHint: t('progress_axis_' + state.period),
    categoryFilter: `<label class="progress-filter"><span>${t('category')}</span><select id="progress-category" aria-label="${esc(t('category'))}"><option value="">${t('progress_all_categories')}</option>${report.categories.map(c => `<option value="${esc(c.key)}" ${state.category === c.key ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>`,
    chart: progressChart(report, state, selected),
    legend: report.categoryStats.map(c => `<span><i class="progress-swatch" style="background:${c.color}"></i>${esc(c.name)}</span>`).join('') + `<span><i class="progress-swatch is-pending"></i>${t('progress_pending')}</span>`,
    formula: t('progress_formula'), chartHelp: t('progress_chart_help'),
    categoryTitle: t('by_category'), categoryHint: t('progress_category_hint'),
    categories: report.categoryStats.length ? report.categoryStats.map(c => `<div class="progress-category-row"><div><span><i class="progress-swatch" style="background:${c.color}"></i>${esc(c.name)}</span><strong>${c.percent}%</strong></div><div class="progress-category-track" aria-hidden="true"><i style="width:${100 * c.completed / c.total}%;background:${c.color}"></i></div><small>${t('progress_category_count', { completed: c.completed, total: c.total })}</small></div>`).join('') : `<p class="muted">${t('progress_no_scheduled')}</p>`,
    detailTitle: selected ? esc(selected.title) : t('progress_task_detail'), detailEyebrow: t('progress_task_detail'),
    detailCount: selected?.total ? `${selected.completed} / ${selected.total} · ${selected.percent}%` : '—',
    detail: progressDetail(selected), explanation: t('progress_counting_hint'),
  });
}

class ProgressPage extends PageController {
  constructor() {
    super(['progress-period', 'progress-prev', 'progress-next', 'progress-today', 'progress-bucket']);
    document.addEventListener('change', event => {
      if (S.view !== 'progress' || !['progress-date', 'progress-category'].includes(event.target.id)) return;
      const state = progressState(), el = event.target;
      if (el.id === 'progress-date') {
        if (!el.value || !el.validity.valid) return;
        state.date = el.value;
      } else state.category = el.value;
      state.bucket = '';
      this.update(`#${el.id}`);
    });
    document.addEventListener('keydown', event => {
      const tab = event.target.closest?.('[role="tab"][data-action="progress-period"]');
      if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = PROGRESS_PERIODS.indexOf(tab.dataset.period);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? 3 : (index + (event.key === 'ArrowRight' ? 1 : 3)) % 4;
      this.handleAction('progress-period', { dataset: { period: PROGRESS_PERIODS[next] } });
    });
  }

  update(focus) {
    const scroll = $('.progress-chart-scroll')?.scrollLeft || 0;
    const top = window.scrollY;
    render();
    const chart = $('.progress-chart-scroll'), selected = $('.progress-column.is-selected');
    if (chart) {
      chart.scrollLeft = scroll;
      if (selected && !focus.includes('progress-bucket')) {
        chart.scrollLeft = Math.max(0, selected.offsetLeft - (chart.clientWidth - selected.offsetWidth) / 2);
      }
    }
    $(focus)?.focus({ preventScroll: true });
    window.scrollTo({ top, behavior: 'instant' });
  }

  async handleAction(action, el) {
    const state = progressState();
    let focus = `[data-action="${action}"]`;
    if (action === 'progress-period') {
      if (!PROGRESS_PERIODS.includes(el.dataset.period)) return;
      state.period = el.dataset.period; state.bucket = '';
      focus = `#progress-tab-${state.period}`;
    } else if (action === 'progress-bucket') {
      state.bucket = el.dataset.bucket;
      focus = `[data-action="progress-bucket"][data-bucket="${CSS.escape(state.bucket)}"]`;
    } else {
      const nextDate = action === 'progress-today' ? today() : progressMoveDate(state.period, state.date, action === 'progress-prev' ? -1 : 1);
      if (nextDate < '1900-01-01' || nextDate > '9998-12-31') return;
      state.date = nextDate; state.bucket = '';
    }
    this.update(focus);
  }
}
