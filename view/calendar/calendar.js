'use strict';

function plannerScheduleFields(entry = {}) {
  const recurrence = entry.recurrence || 'once', start = entry.start_date || S.date || today();
  const days = Array.isArray(entry.schedule_days) ? entry.schedule_days : [dayNum(start)];
  return `<div class="planner-schedule">
    <fieldset class="planner-options"><legend>${t('planner_when')}</legend>
      <label><input type="radio" name="schedule_mode" value="once" ${recurrence === 'once' ? 'checked' : ''}><span>${t('planner_once')}</span></label>
      <label><input type="radio" name="schedule_mode" value="repeat" ${recurrence !== 'once' ? 'checked' : ''}><span>${t('planner_repeat')}</span></label>
    </fieldset>
    <input type="hidden" name="recurrence" value="${esc(recurrence)}">
    <div data-repeat-fields>${selectField('', 'planner_frequency', ['daily','weekly','monthly','yearly'].map(v => [v,t('planner_'+v)]), recurrence === 'once' ? 'weekly' : recurrence).replace('<select ', '<select data-repeat-select ')}
    <div data-week-fields>${daysField(days)}<button class="text-btn planner-weekdays" type="button" data-select-weekdays>${t('planner_weekdays')}</button></div>
    <p class="field-help" data-anchor-hint>${t('planner_anchor_hint')}</p></div>
    <div class="form-grid">${field('start_date', 'planner_date', 'date', start, {required:true,min:'1000-01-01',max:'9998-12-31'})}${field('scheduled_time', 'planner_time', 'time', entry.scheduled_time?.slice(0,5) || '')}</div>
    <div data-end-field>${field('end_date', 'planner_end', 'date', entry.end_date || '', {min:start,max:'9998-12-31'})}</div>
  </div>`;
}

function bindPlannerSchedule(form) {
  $('[data-repeat-select]', form).setAttribute('aria-label', t('planner_frequency'));
  const sync = () => {
    const repeat = $('[name=schedule_mode]:checked', form).value === 'repeat';
    const frequency = $('[data-repeat-select]', form).value;
    $('[name=recurrence]', form).value = repeat ? frequency : 'once';
    $('[data-repeat-fields]', form).hidden = !repeat;
    $('[data-week-fields]', form).hidden = frequency !== 'weekly';
    $('[data-anchor-hint]', form).hidden = !['monthly','yearly'].includes(frequency);
    $('[data-end-field]', form).hidden = !repeat;
    $('[name=end_date]', form).disabled = !repeat;
    $('[name=end_date]', form).min = $('[name=start_date]', form).value;
  };
  form.addEventListener('change', sync);
  $('[data-select-weekdays]', form).addEventListener('click', () => {
    $$('[name=schedule_days]', form).forEach(input => { input.checked = Number(input.value) <= 5; });
  });
  sync();
}

function plannerForm(entry = null, defaults = {}) {
  const value = entry || defaults;
  const categories = (S.sharedWorkspace ? S.ownedWorkspace?.categories : S.data.categories) || [];
  openModal(entry ? 'planner_edit' : 'planner_add', `<form id="planner-form">
    ${entry ? `<input type="hidden" name="id" value="${entry.id}">` : ''}
    ${selectField('kind', 'planner_kind', [['task',t('planner_task')],['habit',t('planner_habit')]], entry?.kind || 'task')}
    ${field('name','planner_name','text',value.name || '',{required:true,maxlength:190})}
    ${textarea('description','description',value.description || '')}
    <div data-habit-fields>${selectField('category_id','category',categories.map(c => [c.id,categoryName(c)]),'',t('planner_personal_category'))}<div class="form-grid">${field('goal','goal','number',1,{min:0.01,max:999999,step:0.01})}${field('unit','unit','text','',{maxlength:40})}</div></div>
    ${plannerScheduleFields(value)}
    <p class="field-help">${t('planner_private')}</p>
    ${entry?.recurrence && entry.recurrence !== 'once' ? `<p class="field-help">${t('planner_edit_series')}</p>` : ''}
    ${formFooter('save', entry ? `<button type="button" class="text-btn danger" data-action="planner-delete" data-id="${entry.id}">${t('delete')}</button>` : '')}
    </form>`, true);
  const form = $('#planner-form');
  $('[name=kind]', form).setAttribute('aria-label', t('planner_kind'));
  $('[name=category_id]', form).setAttribute('aria-label', t('category'));
  if (entry) $('[name=kind]', form).disabled = true;
  const syncKind = () => {
    const habit = $('[name=kind]', form).value === 'habit';
    $('[data-habit-fields]', form).hidden = !habit;
    $$('[data-habit-fields] input, [data-habit-fields] select', form).forEach(input => { input.disabled = !habit; });
  };
  $('[name=kind]',form).addEventListener('change', syncKind);
  bindPlannerSchedule(form); syncKind();
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = $('[type=submit]',form), errorBox = $('.form-error',form);
    if (submit.disabled) return;
    errorBox.textContent = ''; submit.disabled = true;
    const fields = new FormData(form), data = Object.fromEntries(fields);
    data.kind = entry?.kind || data.kind;
    data.schedule_days = fields.getAll('schedule_days').map(Number);
    try {
      if (data.recurrence === 'weekly' && !data.schedule_days.length) throw new Error(t('error_schedule'));
      if ((S.view === 'mindspaces' || S.sharedWorkspace) && !await pageControllers.home.mindspace.flush()) throw new Error(t('error_server'));
      await ajaxRequest.makeRequest('saveCalendarEntry', data, {}, false);
      // Once saved, close before refreshing so a failed refresh cannot resubmit a new entry.
      closeModal();
      await refresh();
      toast(t('planner_saved'));
    } catch (error) {
      if (form.isConnected) errorBox.textContent = error.message;
      else toast(error.message, true);
    } finally { submit.disabled = false; }
  });
}

function plannerEntries(date) {
  const habits = due(date).map(h => ({...h, kind:'habit', completed:done(h,date)}));
  const tasks = (S.data.calendar?.tasks || []).filter(task => scheduled(task,date)).map(task => ({...task,kind:'task',completed:(S.data.calendar.completions || []).some(c => Number(c.task_id) === Number(task.id) && c.completed_on === date)}));
  return [...habits,...tasks].sort((a,b) => (a.scheduled_time || '').localeCompare(b.scheduled_time || '') || a.name.localeCompare(b.name));
}

function plannerEntry(entry, date, compact = false) {
  const isHabit = entry.kind === 'habit';
  return `<article class="planner-entry ${entry.completed ? 'is-done' : ''} ${isHabit ? 'is-habit' : 'is-task'} ${compact ? 'compact' : ''}">
    ${compact ? '' : `<button class="planner-check" data-action="${isHabit ? 'toggle-habit' : 'planner-complete'}" data-id="${entry.id}" data-date="${date}" aria-label="${esc(t('record_progress') + ': ' + entry.name)}" aria-pressed="${entry.completed}" ${date > today() ? 'disabled' : ''}>${entry.completed ? icon('check') : ''}</button>`}
    <button class="planner-entry-content" data-action="${isHabit ? 'habit-detail' : 'planner-edit'}" data-id="${entry.id}" data-date="${date}"><strong>${esc(entry.name)}</strong><span>${entry.scheduled_time ? entry.scheduled_time.slice(0,5) + ' · ' : ''}${t('planner_'+entry.kind)}</span></button>
  </article>`;
}

function plannerDay() {
  const entries = plannerEntries(S.date), untimed = entries.filter(e => !e.scheduled_time);
  return `<section class="card planner-day">
    <div class="planner-day-heading"><div><span class="eyebrow">${t('planner_your_day')}</span><h2>${esc(fmt(S.date,{weekday:'long',day:'numeric',month:'long'}))}</h2></div><span class="badge">${t('planner_count',{count:entries.length})}</span></div>
    <div class="planner-all-day"><span>${t('planner_untimed')}</span><div>${untimed.length ? untimed.map(e => plannerEntry(e,S.date)).join('') : `<p class="muted">${t('planner_nothing_untimed')}</p>`}</div></div>
    ${!entries.length ? `<p class="planner-empty-day">${t('planner_empty_hint')}</p>` : ''}
    <div class="planner-timeline" aria-label="${t('planner_hours')}">${Array.from({length:24},(_,hour) => {
      const time = String(hour).padStart(2,'0')+':00';
      return `<div class="planner-hour"><time>${time}</time><div class="planner-hour-entries">${entries.filter(e => e.scheduled_time && Number(e.scheduled_time.slice(0,2)) === hour).map(e => plannerEntry(e,S.date)).join('')}</div><button class="icon-btn planner-hour-add" data-action="planner-add" data-date="${S.date}" data-time="${time}" aria-label="${esc(t('planner_add_at',{time}))}">${icon('plus')}</button></div>`;
    }).join('')}</div></section>`;
}

function plannerWeek() {
  const dates = Array.from({length:7},(_,i) => shift(monday(S.date),i));
  return `<div class="planner-week">${dates.map(date => {
    const entries = plannerEntries(date);
    return `<section class="card planner-week-day ${date === today() ? 'is-today' : ''}"><button class="planner-week-title" data-action="planner-day" data-date="${date}"><span>${fmt(date,{weekday:'long'})}</span><strong>${Number(date.slice(8))}</strong><small>${t('planner_count',{count:entries.length})}</small></button><div class="planner-week-entries">${entries.map(e => plannerEntry(e,date)).join('') || `<p class="muted">${t('planner_empty')}</p>`}</div><button class="planner-add-day text-btn" data-action="planner-add" data-date="${date}">${icon('plus')}${t('planner_add_short')}</button></section>`;
  }).join('')}</div>`;
}

function plannerMonth() {
  const first = S.date.slice(0,7)+'-01', month = first.slice(0,7), start = monday(first);
  const weekdays = [1,2,3,4,5,6,7].map(n => `<span>${dayLabel(n)}</span>`).join('');
  return `<section class="card planner-month"><div class="planner-month-scroll"><div class="planner-weekday-labels">${weekdays}</div><div class="planner-month-grid">${Array.from({length:42},(_,i) => {
    const date = shift(start,i), entries = plannerEntries(date);
    return `<div class="planner-month-day ${date.slice(0,7) !== month ? 'outside' : ''} ${date === today() ? 'is-today' : ''}"><div class="planner-cell-heading"><button data-action="planner-day" data-date="${date}" aria-label="${esc(fmt(date,{dateStyle:'full'}))}" class="planner-date-number">${Number(date.slice(8))}</button><button class="icon-btn" data-action="planner-add" data-date="${date}" aria-label="${esc(t('planner_add') + ': ' + fmt(date))}">${icon('plus')}</button></div>${entries.slice(0,3).map(e => plannerEntry(e,date,true)).join('')}${entries.length > 3 ? `<button class="text-btn planner-more" data-action="planner-day" data-date="${date}">${t('planner_more',{count:entries.length-3})}</button>` : ''}</div>`;
  }).join('')}</div></div></section>`;
}

function plannerYear() {
  const year = S.date.slice(0,4);
  return `<div class="planner-year">${Array.from({length:12},(_,month) => {
    const first = `${year}-${String(month+1).padStart(2,'0')}-01`, last = dateObj(first);
    last.setUTCMonth(month+1,0);
    const entries = Array.from({length:last.getUTCDate()},(_,i) => plannerEntries(shift(first,i)).length), count = entries.reduce((a,b) => a+b,0);
    return `<button class="card planner-year-month" data-action="planner-month" data-date="${first}"><div class="planner-year-title"><h2>${fmt(first,{month:'long'})}</h2><span>${t('planner_count',{count})}</span></div><div class="planner-mini-grid">${[1,2,3,4,5,6,7].map(n => `<span class="muted">${dayLabel(n).slice(0,2)}</span>`).join('')}${Array.from({length:dayNum(first)-1},() => '<span></span>').join('')}${entries.map((n,i) => `<span class="${n ? 'has-entries' : ''} ${shift(first,i) === today() ? 'is-today' : ''}">${i+1}</span>`).join('')}</div></button>`;
  }).join('')}</div>`;
}

function calendarPage() {
  const view = S.calendarView || 'day';
  let title = fmt(S.date,{month:'long',year:'numeric'});
  if (view === 'day') title = fmt(S.date,{day:'numeric',month:'long',year:'numeric'});
  if (view === 'week') title = `${fmt(monday(S.date))} – ${fmt(shift(monday(S.date),6),{day:'numeric',month:'long',year:'numeric'})}`;
  if (view === 'year') title = S.date.slice(0,4);
  return renderTemplate('calendar', {
    heading:heading(t('calendar'),t('calendar_subtitle'),`<button class="btn primary" data-action="planner-add">${icon('plus')}${t('planner_add')}</button>`),
    tabs:['day','week','month','year'].map(v => `<button role="tab" id="planner-tab-${v}" aria-selected="${view === v}" aria-controls="planner-panel" tabindex="${view === v ? 0 : -1}" data-action="planner-view" data-view-mode="${v}" class="${view === v ? 'active' : ''}">${t('planner_'+v)}</button>`).join(''),
    viewsLabel:t('planner_views'), currentView:view, title:esc(title), todayLabel:t('today'), previousLabel:t('previous'), nextLabel:t('next'), previousIcon:icon('chevron','flip'), nextIcon:icon('chevron'), date:S.date, dateLabel:t('select_date'),
    content:({day:plannerDay,week:plannerWeek,month:plannerMonth,year:plannerYear}[view])(),
  });
}

class CalendarPage extends PageController {
  constructor() {
    super(['date-prev','date-next','today','pick-date','calendar-date','month-prev','month-next','planner-view','planner-prev','planner-next','planner-add','planner-edit','planner-delete','planner-complete','planner-day','planner-month']);
    document.addEventListener('change',event => {
      if (event.target.id !== 'planner-date' || !event.target.value || !event.target.validity.valid) return;
      S.date = event.target.value; S.month = S.date.slice(0,7); render();
    });
    document.addEventListener('keydown',event => {
      if (!event.target.matches?.('.planner-tabs [role=tab]') || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const views = ['day','week','month','year'];
      const index = views.indexOf(S.calendarView);
      S.calendarView = views[event.key === 'Home' ? 0 : event.key === 'End' ? 3 : (index + (event.key === 'ArrowRight' ? 1 : 3)) % 4];
      render(); $(`#planner-tab-${S.calendarView}`).focus();
    });
  }

  async handleAction(action, el, id) {
    if (action === 'planner-add') return plannerForm(null,{start_date:el.dataset.date || S.date,scheduled_time:el.dataset.time || ''});
    if (action === 'planner-edit') {
      const task = S.data.calendar?.tasks.find(e => Number(e.id) === id);
      if (task) plannerForm({...task,kind:'task'});
      return;
    }
    if (action === 'planner-delete') return confirmAction('planner_delete_confirm', async () => { await mutate('deleteCalendarTask',{id}); });
    if (action === 'planner-complete') {
      if (S.busy) return;
      S.busy = true; el.disabled = true;
      try {
        const entry = plannerEntries(el.dataset.date).find(e => e.kind === 'task' && Number(e.id) === id);
        if (entry) { await api('completeCalendarTask',{id,date:el.dataset.date,completed:!entry.completed}); await refresh(); }
      } finally { S.busy = false; if (el.isConnected) el.disabled = false; }
      return;
    }
    if (action === 'planner-view') S.calendarView = el.dataset.viewMode;
    if (['planner-day','pick-date','calendar-date'].includes(action)) {
      S.date = el.dataset.date;
      if (action !== 'pick-date') { S.calendarView = 'day'; S.view = 'calendar'; }
    }
    if (action === 'planner-month') { S.date = el.dataset.date; S.calendarView = 'month'; }
    if (action === 'today') S.date = today();
    if (['date-prev','date-next'].includes(action)) S.date = shift(S.date,action === 'date-next' ? 1 : -1);
    if (['planner-prev','planner-next','month-prev','month-next'].includes(action)) {
      const amount = action.endsWith('next') ? 1 : -1, view = action.startsWith('month') ? 'month' : S.calendarView;
      if (view === 'day' || view === 'week') S.date = shift(S.date,amount*(view === 'week' ? 7 : 1));
      else {
        const date = dateObj(S.date.slice(0,7)+'-01');
        date.setUTCMonth(date.getUTCMonth()+amount*(view === 'year' ? 12 : 1));
        S.date = iso(date);
      }
    }
    S.month = S.date.slice(0,7); render();
    if (action === 'planner-view') $(`#planner-tab-${S.calendarView}`).focus();
  }
}
