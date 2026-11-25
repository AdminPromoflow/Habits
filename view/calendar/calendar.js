'use strict';

function plannerRule(entry) {
  const rule = entry?.recurrence_rule;
  if (!rule) return {};
  if (typeof rule === 'string') { try { return JSON.parse(rule) || {}; } catch { return {}; } }
  return rule;
}

function plannerChoices(name, label, options, selected, cls = '') {
  return `<fieldset class="planner-choices ${cls}"><legend>${esc(t(label))}</legend><div>${options.map(([value,text]) => `<label><input type="checkbox" name="${name}" value="${value}" ${selected.includes(value) ? 'checked' : ''}><span>${esc(text)}</span></label>`).join('')}</div></fieldset>`;
}

function plannerMonthInterval(count) {
  return count === 1 ? t('planner_monthly') : t('planner_every_months',{count});
}

function plannerCategoryOptions(value = {}, existing = false) {
  const data = S.sharedWorkspace ? {...S.data,...S.ownedWorkspace} : S.data;
  const items = data.mindspace?.items || [], spaces = data.mindspace?.spaces || [];
  const folders = new Map(spaces.map(space=>[`space:${space.id}`,space.name]));
  for (const folder of items.filter(item=>item.kind === 'folder')) {
    const path = [], seen = new Set(); let node = folder;
    while (node && !seen.has(node.id)) { seen.add(node.id); path.unshift(node.name); node=items.find(item=>item.kind === 'folder' && Number(item.id) === Number(node.parent_id)); }
    const space = spaces.find(space=>Number(space.id) === Number(folder.mindspace_id));
    folders.set(`folder:${folder.id}`,[space?.name,...path].filter(Boolean).join(' / '));
  }
  const diagram = value.source_diagram_id && items.find(item=>Number(item.diagram_id) === Number(value.source_diagram_id));
  const current = diagram ? (diagram.parent_id ? `folder:${diagram.parent_id}` : `space:${diagram.mindspace_id}`) : null;
  const folder = diagram?.parent_id && items.find(item=>Number(item.id) === Number(diagram.parent_id));
  const parent = folder ? (folder.parent_id ? `folder:${folder.parent_id}` : `space:${folder.mindspace_id}`) : null;
  const nearby = [[current,'planner_current_folder'],[parent,'planner_parent_folder']].filter(([key])=>key && folders.has(key)).map(([key,label])=>[key,`${t(label)} — ${folders.get(key)}`]);
  const categoryKey = category => category.source_folder_id && folders.has(`folder:${category.source_folder_id}`) ? `folder:${category.source_folder_id}` : category.source_mindspace_id && folders.has(`space:${category.source_mindspace_id}`) ? `space:${category.source_mindspace_id}` : `category:${category.id}`;
  const categories = [...new Map([...(data.categories || []),...(S.data.category_catalog || [])].map(category=>[Number(category.id),category])).values()];
  const selectedCategory = categories.find(category=>Number(category.id) === Number(value.category_id));
  const selected = selectedCategory ? categoryKey(selectedCategory) : existing ? (value.kind === 'task' ? 'none' : 'default') : current || 'default';
  return {selected, groups:[
    [null,[['default',t('calendar')],...(existing && value.kind === 'task' && !value.category_id ? [['none',t('planner_no_category')]] : [])]],
    ['planner_nearby_folders',nearby],
    ['planner_other_folders',[...folders].filter(([key])=>!nearby.some(([near])=>near === key)).sort((a,b)=>a[1].localeCompare(b[1]))],
    ['planner_existing_categories',categories.filter(category=>categoryKey(category).startsWith('category:')).map(category=>[`category:${category.id}`,categoryName(category)]).sort((a,b)=>a[1].localeCompare(b[1]))],
    [null,[['new',`+ ${t('new_category')}`]]]
  ]};
}

function plannerCategoryFields(value, existing) {
  const {selected,groups} = plannerCategoryOptions(value,existing);
  return `<label class="field"><span>${t('category')}</span><select name="category_choice" aria-label="${esc(t('category'))}">${groups.filter(([,options])=>options.length).map(([label,options])=>`${label ? `<optgroup label="${esc(t(label))}">` : ''}${options.map(([key,name])=>`<option value="${esc(key)}" ${key === selected ? 'selected' : ''}>${esc(name)}</option>`).join('')}${label ? '</optgroup>' : ''}`).join('')}</select></label><div data-new-planner-category hidden>${field('new_category_name','planner_new_category_name','text','',{maxlength:100})}</div>`;
}

function plannerScheduleFields(entry = {}, kind = null) {
  const recurrence = entry.recurrence || (kind === 'habit' ? 'weekly' : 'once');
  const start = entry.start_date || S.date || today(), rule = plannerRule(entry);
  const days = Array.isArray(entry.schedule_days) ? entry.schedule_days : [dayNum(start)];
  const frequency = recurrence === 'once' ? 'weekly' : recurrence;
  return `<div class="planner-schedule" ${kind ? 'data-quick-schedule' : ''} ${kind && recurrence !== 'once' && kind === 'task' ? 'data-legacy-repeat' : ''}>
    ${kind ? '' : `<fieldset class="planner-options"><legend>${t('planner_when')}</legend><label><input type="radio" name="schedule_mode" value="once" ${recurrence === 'once' ? 'checked' : ''}><span>${t('planner_once')}</span></label><label><input type="radio" name="schedule_mode" value="repeat" ${recurrence !== 'once' ? 'checked' : ''}><span>${t('planner_repeat')}</span></label></fieldset>`}
    <input type="hidden" name="recurrence" value="${recurrence}"><input type="hidden" name="recurrence_rule" value="">
    <div data-repeat-fields>
      <fieldset class="planner-frequency"><legend>${t('planner_frequency')}</legend><div>${['yearly','monthly','weekly','daily'].map(v => `<label><input type="radio" name="repeat_frequency" value="${v}" ${frequency === v ? 'checked' : ''}><span>${t('planner_'+v)}</span></label>`).join('')}</div></fieldset>
      <div data-week-fields>${daysField(days)}<button class="text-btn planner-weekdays" type="button" data-select-weekdays>${t('planner_weekdays')}</button></div>
      <div data-year-fields>
        ${selectField('month_preset','planner_month_spacing',[[0,t('planner_choose_months')],...[1,2,3,4,6,12].map(n=>[n,plannerMonthInterval(n)])],0)}
        ${plannerChoices('rule_months','planner_months',Array.from({length:12},(_,i)=>[i+1,fmt(`2026-${String(i+1).padStart(2,'0')}-01`,{month:'short'})]),rule.months || [Number(start.slice(5,7))],'planner-month-choices')}
      </div>
      <div data-month-interval>${selectField('rule_interval','planner_month_spacing',Array.from({length:12},(_,i)=>[i+1,plannerMonthInterval(i+1)]),rule.interval || 1)}</div>
      <div data-month-fields>
        <fieldset class="planner-month-mode"><legend>${t('planner_month_pattern')}</legend><div>${['dates','weekdays'].map(v => `<label><input type="radio" name="month_mode" value="${v}" ${(rule.month_mode || 'dates') === v ? 'checked' : ''}><span>${t('planner_month_'+v)}</span></label>`).join('')}</div></fieldset>
        <div data-month-dates>${plannerChoices('rule_month_days','planner_month_days',Array.from({length:31},(_,i)=>[i+1,String(i+1)]),rule.month_days || [Number(start.slice(8))],'planner-number-choices')}<p class="field-help">${t('planner_short_month')}</p></div>
        <div data-month-weekdays>${plannerChoices('rule_positions','planner_which_weeks',[1,2,3,4,5,-1].map(n=>[n,t('planner_position_'+n)]),rule.positions || [Math.ceil(Number(start.slice(8))/7)],'planner-position-choices')}${plannerChoices('rule_weekdays','days',[1,2,3,4,5,6,7].map(n=>[n,dayLabel(n)]),rule.weekdays || [dayNum(start)],'planner-weekday-choices')}</div>
      </div>
    </div>
    <div class="form-grid">${field('start_date',kind === 'task' ? 'planner_on_date' : 'start_date','date',start,{required:true,min:'1000-01-01',max:'9998-12-31'})}${field('scheduled_time','planner_time','time',entry.scheduled_time?.slice(0,5) || '')}</div>
    <details data-end-field ${entry.end_date ? 'open' : ''}><summary>${t('planner_end')}</summary>${field('end_date','end_date','date',entry.end_date || '',{min:start,max:'9998-12-31'})}</details>
  </div>`;
}

function bindPlannerSchedule(form) {
  const schedule = $('.planner-schedule',form);
  const sync = () => {
    const quick = schedule.hasAttribute('data-quick-schedule');
    const repeat = quick ? ($('[name=kind]:checked',form)?.value === 'habit' || schedule.hasAttribute('data-legacy-repeat')) : $('[name=schedule_mode]:checked',form).value === 'repeat';
    const frequency = $('[name=repeat_frequency]:checked',form).value;
    const monthMode = $('[name=month_mode]:checked',form).value;
    $('[name=recurrence]',form).value = repeat ? frequency : 'once';
    const visible = {repeat:repeat,week:repeat && frequency === 'weekly',year:repeat && frequency === 'yearly',month:repeat && ['monthly','yearly'].includes(frequency)};
    for (const [section,show] of Object.entries(visible)) $(`[data-${section}-fields]`,form).hidden = !show;
    $('[data-month-interval]',form).hidden = !repeat || frequency !== 'monthly';
    $('[data-month-dates]',form).hidden = monthMode !== 'dates';
    $('[data-month-weekdays]',form).hidden = monthMode !== 'weekdays';
    $('[data-end-field]',form).hidden = !repeat;
    $('[name=end_date]',form).disabled = !repeat;
    $('[name=end_date]',form).min = $('[name=start_date]',form).value;
    if (quick) $('[name=start_date]',form).previousElementSibling.textContent = t(repeat ? 'start_date' : 'planner_on_date');
    const selected = name => $$(`[name=${name}]:checked`,form).map(input=>Number(input.value));
    const rule = visible.month ? {month_mode:monthMode,...(monthMode === 'dates' ? {month_days:selected('rule_month_days')} : {positions:selected('rule_positions'),weekdays:selected('rule_weekdays')}),...(frequency === 'yearly' ? {months:selected('rule_months')} : {interval:Number($('[name=rule_interval]',form).value)})} : null;
    $('[name=recurrence_rule]',form).value = JSON.stringify(rule);
  };
  form.addEventListener('change',event => {
    if (event.target.name === 'month_preset' && Number(event.target.value)) {
      const interval = Number(event.target.value), startMonth = Number($('[name=start_date]',form).value.slice(5,7));
      $$('[name=rule_months]',form).forEach(input => { input.checked = ((Number(input.value)-startMonth+12)%12)%interval === 0; });
    }
    if (event.target.name === 'rule_months') $('[name=month_preset]',form).value = '0';
    sync();
  });
  $('[data-select-weekdays]',form).addEventListener('click',()=>{
    $$('[name=schedule_days]',form).forEach(input=>{input.checked=Number(input.value)<=5;}); sync();
  });
  sync();
  return sync;
}

function plannerForm(entry = null, defaults = {}) {
  const value = entry || defaults, kind = entry?.kind || defaults.kind || 'task';
  const canDelete = entry && (kind === 'task' || entry.permission === 'owner');
  openModal(entry ? 'planner_edit' : 'planner_add', `<form id="planner-form">
    ${entry ? `<input type="hidden" name="id" value="${entry.id}">` : ''}
    ${field('name','planner_kind','text',value.name || '',{required:true,maxlength:190})}
    <fieldset class="planner-kind"><legend>${t('planner_activity_type')}</legend><div>${['habit','task'].map(v=>`<label><input type="radio" name="kind" value="${v}" ${v === kind ? 'checked' : ''} ${entry ? 'disabled' : ''}><span>${icon(v === 'habit' ? 'habits' : 'calendar')}<strong>${t('planner_'+v)}</strong><small>${t('planner_'+v+'_hint')}</small></span></label>`).join('')}</div></fieldset>
    ${plannerCategoryFields(value,!!entry)}
    ${plannerScheduleFields(value,entry && kind === 'habit' && entry.recurrence === 'once' ? null : kind)}
    <details class="planner-description" ${value.description ? 'open' : ''}><summary>${t('planner_optional_description')}</summary>${textarea('description','description',value.description || '')}</details>
    ${entry?.recurrence && entry.recurrence !== 'once' ? `<p class="field-help">${t('planner_edit_series')}</p>` : ''}
    ${formFooter('save',canDelete ? `<button type="button" class="text-btn danger" data-action="${kind === 'habit' ? 'planner-delete-habit' : 'planner-delete'}" data-id="${entry.id}">${icon('trash')}${t(kind === 'habit' ? 'planner_delete_habit' : 'planner_delete_task')}</button>` : '')}
  </form>`,true);
  $('#modal').classList.add('planner-dialog');
  const form = $('#planner-form');
  bindPlannerSchedule(form);
  const syncCategory = () => {
    const isNew = $('[name=category_choice]',form).value === 'new';
    $('[data-new-planner-category]',form).hidden = !isNew;
    const input = $('[name=new_category_name]',form);
    input.disabled = !isNew; input.required = isNew;
  };
  $('[name=category_choice]',form).addEventListener('change',()=>{syncCategory(); if ($('[name=category_choice]',form).value === 'new') $('[name=new_category_name]',form).focus();});
  syncCategory();
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const submit=$('[type=submit]',form), errorBox=$('.form-error',form);
    if (submit.disabled) return;
    errorBox.textContent=''; submit.disabled=true;
    const fields=new FormData(form), data=Object.fromEntries(fields);
    data.kind=entry?.kind || data.kind;
    data.schedule_days=fields.getAll('schedule_days').map(Number);
    data.recurrence_rule=JSON.parse(data.recurrence_rule);
    if (entry?.kind === 'habit') for (const key of ['routine_id','goal','unit','section']) data[key]=entry[key];
    // Existing activities keep their link even if the original node was removed.
    const source=!entry && defaults.source_diagram_id ? defaults : null;
    if (source?.source_diagram_id) { data.source_diagram_id=source.source_diagram_id; data.source_node_key=source.source_node_key; }
    try {
      if (data.recurrence === 'weekly' && !data.schedule_days.length) throw new Error(t('error_schedule'));
      if (data.recurrence_rule && Object.values(data.recurrence_rule).some(v=>Array.isArray(v) && !v.length)) throw new Error(t('error_planner_selection'));
      if ((S.view === 'mindspaces' || S.sharedWorkspace) && !await pageControllers.home.mindspace.flush()) throw new Error(t('error_server'));
      await ajaxRequest.makeRequest('saveCalendarEntry',data,{},false);
      closeModal(); await refresh(); toast(t('planner_saved'));
    } catch(error) { if(form.isConnected) errorBox.textContent=error.message; else toast(error.message,true); }
    finally { submit.disabled=false; }
  });
}

function plannerEntries(date) {
  const habits = due(date).map(h => ({...h, kind:'habit', completed:done(h,date)}));
  const tasks = (S.data.calendar?.tasks || []).filter(task => scheduled(task,date)).map(task => ({...task,kind:'task',completed:(S.data.calendar.completions || []).some(c => Number(c.task_id) === Number(task.id) && c.completed_on === date)}));
  return [...habits,...tasks].sort((a,b) => (a.scheduled_time || '').localeCompare(b.scheduled_time || '') || a.name.localeCompare(b.name));
}

function plannerEntry(entry, date, compact = false) {
  const isHabit = entry.kind === 'habit';
  const category = [...(S.data.categories || []),...(S.data.category_catalog || [])].find(item => Number(item.id) === Number(entry.category_id));
  // Shared habits also carry their category color when it is absent from the personal catalog.
  const categoryColor = category?.color || entry.color;
  const color = /^#[0-9a-f]{6}$/i.test(categoryColor || '') ? categoryColor : '#B8A4D4';
  return `<article class="planner-entry ${entry.completed ? 'is-done' : ''} ${isHabit ? 'is-habit' : 'is-task'} ${compact ? 'compact' : ''}" style="--planner-color:${color}">
    ${compact ? '' : `<button class="planner-check" data-action="${isHabit ? 'toggle-habit' : 'planner-complete'}" data-id="${entry.id}" data-date="${date}" aria-label="${esc(t('record_progress') + ': ' + entry.name)}" aria-pressed="${entry.completed}" ${date > today() ? 'disabled' : ''}>${entry.completed ? icon('check') : ''}</button>`}
    <button class="planner-entry-content" data-action="${isHabit ? (entry.permission === 'owner' ? 'planner-edit-habit' : 'habit-detail') : 'planner-edit'}" data-id="${entry.id}" data-date="${date}"><strong>${esc(entry.name)}</strong><span>${entry.scheduled_time ? entry.scheduled_time.slice(0,5) + ' · ' : ''}${t('planner_'+entry.kind)}</span></button>
  </article>`;
}

function plannerWeek() {
  const dates = Array.from({length:7},(_,i) => shift(monday(S.date),i));
  const days = dates.map(date => ({date,entries:plannerEntries(date)}));
  const slot = (day, hour = null) => {
    const time = hour === null ? '' : String(hour).padStart(2,'0')+':00';
    const entries = day.entries.filter(entry => hour === null ? !entry.scheduled_time : entry.scheduled_time && Number(entry.scheduled_time.slice(0,2)) === hour);
    const label = `${fmt(day.date,{dateStyle:'full'})} · ${hour === null ? t('planner_add') : t('planner_add_at',{time})}`;
    return `<div class="planner-slot ${day.date === today() ? 'is-today' : ''}" data-slot-date="${day.date}" data-slot-time="${time}">
      <button class="planner-slot-add" data-action="planner-add" data-date="${day.date}" data-time="${time}" aria-label="${esc(label)}">${icon('plus')}</button>
      ${entries.length ? `<div class="planner-slot-entries">${entries.map(entry => plannerEntry(entry,day.date)).join('')}</div>` : ''}
    </div>`;
  };
  return `<section class="planner-week-scroll" aria-labelledby="planner-period" tabindex="0" data-week="${dates[0]}">
    <div class="planner-week">
      <div class="planner-week-header">
        <div class="planner-week-row planner-day-labels">
          <div class="planner-time-label planner-corner">${icon('clock')}<span>${t('planner_hour_column')}</span></div>
          ${days.map((day,index) => `<div class="planner-week-title planner-color-${index} ${day.date === today() ? 'is-today' : ''}" ${day.date === today() ? 'aria-current="date"' : ''}>
            <span>${esc(fmt(day.date,{weekday:'long'}))}</span><strong>${Number(day.date.slice(8))}</strong>
            <small>${t('planner_count',{count:day.entries.length})}</small>
          </div>`).join('')}
        </div>
        <div class="planner-week-row planner-untimed-row"><div class="planner-time-label">${t('planner_untimed')}</div>${days.map(day => slot(day)).join('')}</div>
      </div>
      <div class="planner-week-hours" aria-label="${esc(t('planner_hours'))}">
        ${Array.from({length:24},(_,hour) => `<div class="planner-week-row planner-hour-row" data-hour="${hour}">
          <div class="planner-time-label"><time>${String(hour).padStart(2,'0')}:00</time></div>${days.map(day => slot(day,hour)).join('')}
        </div>`).join('')}
      </div>
    </div>
  </section>`;
}

function calendarPage() {
  const start = monday(S.date), end = shift(start,6);
  const title = `${fmt(start,{day:'numeric',month:'short',...(start.slice(0,4) !== end.slice(0,4) ? {year:'numeric'} : {})})} – ${fmt(end,{day:'numeric',month:'short',year:'numeric'})}`;
  return renderTemplate('calendar', {
    heading:heading(t('calendar'),t('calendar_subtitle'),`<button class="btn primary" data-action="planner-add">${icon('plus')}${t('planner_add')}</button>`),
    weekLabel:t('planner_week'), weekIcon:icon('calendar'), title:esc(title), todayLabel:t('today'), previousLabel:t('previous'), nextLabel:t('next'), previousIcon:icon('chevron','flip'), nextIcon:icon('chevron'), date:S.date, dateLabel:t('select_date'),
    content:plannerWeek(), hintIcon:icon('clock'), hint:t('planner_week_hint'),
  });
}

class CalendarPage extends PageController {
  constructor() {
    super(['date-prev','date-next','today','pick-date','calendar-date','planner-prev','planner-next','planner-add','planner-edit','planner-delete','planner-delete-habit','planner-edit-habit','planner-complete']);
    document.addEventListener('change',event => {
      if (event.target.id !== 'planner-date' || !event.target.value || !event.target.validity.valid) return;
      this.scrollPosition = null;
      S.date = event.target.value; S.month = S.date.slice(0,7); render();
    });
    document.addEventListener('keydown',async event => {
      if (event.target.matches?.('.planner-section-tabs [role=tab]') && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
        event.preventDefault();
        const view = event.key === 'Home' ? 'calendar' : event.key === 'End' ? 'habits' : S.view === 'calendar' ? 'habits' : 'calendar';
        await navigate(view); $(`#planner-section-${view}`).focus(); return;
      }
    });
  }

  mount() {
    const scroller = $('.planner-week-scroll');
    if (!scroller) return;
    const saved = this.scrollPosition;
    if (saved?.week === scroller.dataset.week) {
      scroller.scrollTop = saved.top;
      scroller.scrollLeft = saved.left;
    } else {
      const firstHour = $('[data-hour="7"]',scroller);
      scroller.scrollTop = firstHour.offsetTop - $('.planner-week-header',scroller).offsetHeight;
    }
    const remember = () => { this.scrollPosition = {week:scroller.dataset.week,top:scroller.scrollTop,left:scroller.scrollLeft}; };
    scroller.addEventListener('scroll',remember,{passive:true});
    remember();
  }

  async handleAction(action, el, id) {
    if (action === 'planner-add') return plannerForm(null,{start_date:el.dataset.date || S.date,scheduled_time:el.dataset.time || '',category_id:el.dataset.category || null});
    if (action === 'planner-edit-habit') {
      const habit = S.data.habits.find(h => Number(h.id) === id);
      if (habit?.permission === 'owner') plannerForm({...habit, kind:'habit'});
      return;
    }
    if (action === 'planner-delete-habit') return confirmAction('planner_delete_habit_confirm', async () => { await mutate('deleteHabit',{id}); });
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
    if (['pick-date','calendar-date'].includes(action)) {
      S.date = el.dataset.date;
      if (action === 'calendar-date') { this.scrollPosition = null; S.view = 'calendar'; }
    }
    if (action === 'today') { S.date = today(); this.scrollPosition = null; }
    if (['date-prev','date-next'].includes(action)) S.date = shift(S.date,action === 'date-next' ? 1 : -1);
    if (['planner-prev','planner-next'].includes(action)) S.date = shift(S.date,action === 'planner-next' ? 7 : -7);
    S.month = S.date.slice(0,7); render();
    if (['planner-prev','planner-next','today'].includes(action)) $(`[data-action="${action}"]`)?.focus({preventScroll:true});
  }
}
