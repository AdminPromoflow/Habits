'use strict';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const S = {
  language: 'en',
  dict: { en: {}, es: {} },
  user: null,
  data: null,
  admin: null,
  view: 'home',
  mode: 'personal',
  date: '',
  month: '',
  filter: { category: '', routine: '', status: 'active', search: '' },
  sharingTab: 'all',
  sharePerson: null,
  shareFilter: { permission: '', category: '', owner: '', status: '', search: '' },
  period: 30,
  setupToken: null,
  resetToken: null,
  recoverySent: false,
  passwordReset: false,
  busy: false,
};
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const t = (key, params = {}) => {
  let v = S.dict[S.language]?.[key] ?? key;
  for (const [k, val] of Object.entries(params)) v = v.replaceAll(`{${k}}`, String(val));
  return v;
};
const ICONS = {
  home: 'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  habits: 'M9 6h11M9 12h11M9 18h11M3 6l1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2',
  calendar: 'M4 5h16v16H4zM4 9h16M8 3v4M16 3v4M8 13h1M15 13h1M8 17h1M15 17h1',
  progress: 'M4 20V4M4 20h17M8 16v-4M13 16V8M18 16V5',
  categories: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  sharing:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  profile: 'M20 21a8 8 0 0 0-16 0M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  plus: 'M12 5v14M5 12h14',
  check: 'm5 12 4 4L19 6',
  close: 'm6 6 12 12M18 6 6 18',
  chevron: 'm9 5 7 7-7 7',
  chevronDown: 'm6 9 6 6 6-6',
  lock: 'M6 10h12v11H6zM8 10V7a4 4 0 0 1 8 0v3',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  logout: 'M9 3H4v18h5M14 8l5 4-5 4M8 12h11',
  folder: 'M3 7V5h6l2 2h10v13H3V7Z',
  table: 'M3 4h18v16H3V4ZM3 9h18M3 14h18M9 4v16M15 4v16',
  search: 'M21 21l-5-5M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1',
  moon: 'M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10',
  dumbbell: 'm6 4-3 3 14 14 3-3ZM4 11 2 9M15 3l-2 2M9 22l2-2M21 13l-2 2M6 14l8-8M10 18l8-8',
  flower:
    'M12 9c-8-10-14 4-4 5-8 8 6 13 7 3 10 7 13-7 3-8 5-10-9-12-6 0ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  book: 'M12 5c-4-2-7-2-10-1v15c3-1 6-1 10 1 4-2 7-2 10-1V4c-3-1-6-1-10 1v15',
  heart:
    'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  leaf: 'M20 3C7 1 0 9 6 16s17 3 14-13ZM4 21 16 9',
  sparkles: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4M18 4h4',
  coffee: 'M3 8h13v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4ZM16 9h2a3 3 0 0 1 0 6h-2M6 2v3M10 2v3M14 2v3',
  music: 'M9 18V5l12-3v13M9 16c-8-2-8 6-3 6 2 0 3-2 3-4M21 13c-8-2-8 6-3 6 2 0 3-2 3-4',
  briefcase: 'M3 7h18v14H3zM8 7V3h8v4M3 12c6 3 12 3 18 0M10 13h4',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2',
  fire: 'M13 2c1 7-6 5-3 11-3-1-4-3-4-3-7 15 18 16 13 1-1 3-4 3-4 3 2-6-2-12-2-12',
  shield: 'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6ZM8 12l3 3 5-6',
  edit: 'm16 3 5 5-12 12-6 1 1-6ZM13 6l5 5',
  trash: 'M3 6h18M8 6V3h8v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  copy: 'M9 8H4v13h11v-5M9 3h7l5 5v9H9zM16 3v6h5',
  cut: 'M7 7a3 3 0 1 0-6 0 3 3 0 0 0 6 0ZM7 17a3 3 0 1 0-6 0 3 3 0 0 0 6 0ZM6 9l16 10M6 15 22 5M12 12l4-1',
  paste: 'M8 4H5v17h14V4h-3M8 2h8v5H8zM9 11h6M9 15h6',
  image: 'M3 4h18v16H3zM3 16l5-5 5 5 4-4 4 4M16 8h.01',
  format: 'M3 5V3h3M10 3h4M18 3h3v2M21 9v6M21 19v2h-3M14 21h-4M6 21H3v-2M3 15V9M8 17l4-10 4 10M10 13h4',
  link: 'M10 14a5 5 0 0 1 0-7l3-3a5 5 0 0 1 7 7l-2 2M14 10a5 5 0 0 1 0 7l-3 3a5 5 0 0 1-7-7l2-2',
  checkbox: 'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM7 12l3 4 7-8',
  tag: 'M10 3h10v18H10L2 15V9z',
  branch: 'M3 9h6v6H3zM15 3h6v6h-6zM15 15h6v6h-6zM9 12h3M12 6v12M12 6h3M12 18h3',
  resize: 'M3 9V3h6M15 21h6v-6M3 3l18 18M3 12h9v9H3zM12 3h9v9h-9z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  overview: 'M3 3h7v10H3zM14 3h7v6h-7zM3 17h7v4H3zM14 13h7v8h-7z',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M9 3l1-1h4l1 3 3 1 3 3-1 3 1 3-3 3-3 1-1 3h-4l-1-3-3-1-3-3 1-3-1-3 3-3 3-1Z',
};

function icon(name, cls = '') {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name] || ICONS.sparkles}"/></svg>`;
}

function flower() {
  return '<img src="assets/favicon.svg" alt="" class="brand-flower">';
}
const dateObj = (date) => new Date(date + 'T12:00:00Z');
const iso = (d) => d.toISOString().slice(0, 10);

function shift(date, days) {
  const d = dateObj(date);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}
const locale = () => (S.language === 'es' ? 'es-CO' : 'en-US');
const fmt = (date, opts = { month: 'long', day: 'numeric' }) =>
  new Intl.DateTimeFormat(locale(), { ...opts, timeZone: 'UTC' }).format(dateObj(date));

function dayNum(date) {
  return dateObj(date).getUTCDay() || 7;
}

function monday(date) {
  return shift(date, 1 - dayNum(date));
}
const today = () =>
  S.data?.today ||
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

function dayLabel(n, long = false) {
  return fmt(shift('2026-11-23', n - 1), { weekday: long ? 'long' : 'short' });
}

function categoryName(c) {
  return c.translation_key ? t(c.translation_key) : c.name;
}

function habitCategory(h) {
  return h.category_key ? t(h.category_key) : h.category_name;
}

function scheduled(h, date) {
  return (
    date >= (h.tracking_start || h.start_date) &&
    (!h.end_date || date <= h.end_date) &&
    h.schedule_days.includes(dayNum(date))
  );
}

function completion(h, date) {
  return S.data.completions.find(
    (c) => Number(c.habit_id) === Number(h.id) && c.completed_on === date
  );
}

function done(h, date) {
  const c = completion(h, date);
  return !!c && Number(c.amount) >= Number(c.goal_at_time);
}

function due(date, habits = S.data.habits) {
  return habits.filter(
    (h) => h.status === 'active' && h.permission !== 'viewer' && scheduled(h, date)
  );
}

function counts(date, habits = S.data.habits) {
  const list = due(date, habits);
  return { total: list.length, done: list.filter((h) => done(h, date)).length };
}

function stats(start, end, habits = S.data.habits) {
  let total = 0,
    completed = 0,
    fraction = 0;
  for (let d = start; d <= end; d = shift(d, 1)) {
    if (d > today()) break;
    for (const h of habits.filter((h) => h.permission !== 'viewer' && scheduled(h, d))) {
      total++;
      const c = completion(h, d);
      if (c) {
        fraction += Math.min(1, Number(c.amount) / Number(c.goal_at_time));
        if (Number(c.amount) >= Number(c.goal_at_time)) completed++;
      }
    }
  }
  return { total, completed, percent: total ? Math.round((fraction / total) * 100) : 0 };
}

function streak() {
  let n = 0;
  let started = false;
  for (let i = 0; i < 366; i++) {
    const date = shift(today(), -i),
      c = counts(date);
    if (!c.total) continue;
    if (c.done === c.total) {
      n++;
      started = true;
    } else if (i > 0 || started) break;
  }
  return n;
}

function scheduleLabel(h) {
  return h.schedule_days.length === 7
    ? t('schedule_daily')
    : h.schedule_days.map((n) => dayLabel(n)).join(' · ');
}

function goalLabel(h) {
  return `${Number(h.goal)}${h.unit ? ' ' + esc(['minutes', 'pages', 'glasses'].includes(h.unit) ? t(h.unit) : h.unit) : ''}`;
}

function badge(key, cls = '') {
  return `<span class="badge ${esc(key)} ${cls}">${esc(t(key))}</span>`;
}

function empty(title, description = '', action = '') {
  return `<div class="empty">${icon('flower')}<h3>${esc(t(title))}</h3>${description ? `<p>${esc(t(description))}</p>` : ''}${action}</div>`;
}

function button(label, action, style = 'primary', extra = '') {
  return `<button class="btn ${style}" data-action="${action}" ${extra}>${esc(t(label))}</button>`;
}

function toast(message, error = false) {
  const el = $('#toast');
  el.className = error ? 'show error' : 'show';
  el.textContent = message;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.className = ''), 4500);
}

function heading(title, subtitle, action = '', eyebrow = '') {
  return `<div class="page-heading"><div>${eyebrow ? `<span class="eyebrow">${eyebrow}</span>` : ''}<h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
}

function dateControl() {
  return `<div class="date-control"><button class="icon-btn" data-action="date-prev" aria-label="${t('previous')}">${icon('chevron', 'flip')}</button><input type="date" id="selected-date" value="${S.date}" aria-label="${t('select_date')}"><button class="icon-btn" data-action="date-next" aria-label="${t('next')}">${icon('chevron')}</button><button class="text-btn" data-action="today">${t('today')}</button></div>`;
}

function ring(percent, label, small = false) {
  return `<div class="progress-ring ${small ? 'small' : ''}" style="--progress:${Math.max(0, Math.min(100, percent))}%"><div><strong>${percent}<span>%</span></strong>${label ? `<span>${label}</span>` : ''}</div></div>`;
}

function habitRow(h, compact = false) {
  const c = completion(h, S.date),
    isDone = done(h, S.date),
    canComplete =
      h.permission !== 'viewer' &&
      h.status === 'active' &&
      scheduled(h, S.date) &&
      S.date <= today();
  return `<article class="habit-row ${isDone ? 'is-done' : ''}" style="--category-color:${esc(h.color)}"><button class="habit-check" data-action="toggle-habit" data-id="${h.id}" aria-label="${esc(t('record_progress'))}: ${esc(h.name)}" aria-pressed="${isDone}" ${canComplete ? '' : `disabled title="${t('future_hint')}"`}>${isDone ? icon('check') : ''}</button><span class="habit-symbol">${icon(h.icon)}</span><button class="habit-title" data-action="habit-detail" data-id="${h.id}"><strong>${esc(h.name)}</strong><span>${esc(habitCategory(h))}${h.description ? ' <span class="separator">·</span> ' + esc(h.description) : ''}</span></button><div class="habit-meta">${h.scheduled_time ? `<span>${icon('clock')}${h.scheduled_time.slice(0, 5)}</span>` : ''}${!compact ? `<small>${c ? Number(c.amount) : 0} / ${goalLabel(h)}</small>` : ''}</div><button class="icon-btn" data-action="habit-detail" data-id="${h.id}" aria-label="${esc(h.name)}">${icon('chevron')}</button></article>`;
}

function categoryCard(c, compact = false) {
  const count = S.data.habits.filter(
    (h) =>
      Number(h.category_id) === Number(c.id) && h.permission === 'owner' && h.status === 'active'
  ).length;
  return `<article class="category-card" style="--category-color:${esc(c.color)}"><button class="category-open" data-action="filter-category" data-id="${c.id}"><span class="category-icon">${icon(c.icon)}</span><h3>${esc(categoryName(c))}</h3><p>${t('habits_count', { count })}</p></button>${!compact ? `<div class="category-card-bottom">${badge(c.owner_user_id ? 'private' : 'global')}<div>${c.owner_user_id ? `<button class="icon-btn" data-action="edit-category" data-id="${c.id}" aria-label="${t('edit')}">${icon('edit')}</button>` : ''}<button class="icon-btn" data-action="share-category" data-id="${c.id}" aria-label="${t('share_category')}">${icon('sharing')}</button></div></div>` : ''}</article>`;
}

function field(name, label, type = 'text', value = '', attrs = {}) {
  return `<label class="field"><span>${t(label)}</span><input type="${type}" name="${name}" value="${esc(value)}" ${Object.entries(
    attrs
  )
    .map(([k, v]) => (v === true ? k : `${k}="${esc(v)}"`))
    .join(' ')}></label>`;
}

function textarea(name, label, value = '', required = false) {
  return `<label class="field"><span>${t(label)}</span><textarea name="${name}" rows="3" maxlength="${name === 'description' ? 5000 : 1000}" ${required ? 'required' : ''}>${esc(value)}</textarea></label>`;
}

function selectField(name, label, options, value = '', emptyLabel = null) {
  return `<label class="field"><span>${t(label)}</span>${selectControl('', options, value, emptyLabel, name)}</label>`;
}

function selectControl(id, options, value = '', emptyLabel = null, name = '') {
  return `<select ${id ? `id="${id}"` : ''} ${name ? `name="${name}"` : ''} aria-label="${esc(emptyLabel || t(name) || id)}">${emptyLabel !== null ? `<option value="">${esc(emptyLabel)}</option>` : ''}${options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
}

function checkbox(name, label, checked = false) {
  return `<label class="checkbox-field"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}><span>${t(label)}</span></label>`;
}

function daysField(days = [1, 2, 3, 4, 5, 6, 7]) {
  return `<fieldset class="day-field"><legend>${t('days')}</legend><div>${[1, 2, 3, 4, 5, 6, 7].map((n) => `<label><input type="checkbox" name="schedule_days" value="${n}" ${days.includes(n) ? 'checked' : ''}><span>${dayLabel(n)}</span></label>`).join('')}</div></fieldset>`;
}
