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

function plannerEntryCategory(entry) {
  const category = [...(S.data.categories || []),...(S.data.category_catalog || [])].find(item => Number(item.id) === Number(entry.category_id));
  // Shared habits carry their category name and color even outside the personal catalog.
  const categoryColor = category?.color || entry.color;
  return {
    name:(category ? categoryName(category) : habitCategory(entry)) || t('planner_no_category'),
    color:/^#[0-9a-f]{6}$/i.test(categoryColor || '') ? categoryColor : '#B8A4D4',
  };
}

function plannerEntryColor(entry) {
  return plannerEntryCategory(entry).color;
}

function plannerCategoryKey(entry) {
  return entry.category_id ? String(Number(entry.category_id)) : 'none';
}

function plannerFilterCategories() {
  const categories = new Map((S.data.categories || []).map(category => [String(Number(category.id)),plannerEntryCategory({category_id:category.id})]));
  const entries = [...(S.data.calendar?.tasks || []),...(S.data.habits || []).filter(habit => habit.status === 'active' && habit.permission !== 'viewer')];
  for (const entry of entries) {
    const key = plannerCategoryKey(entry);
    if (!categories.has(key)) categories.set(key,plannerEntryCategory(entry));
  }
  return [...categories].map(([key,category]) => ({key,...category})).sort((a,b) => a.name.localeCompare(b.name,S.language));
}

function plannerNoteEntries(date) {
  return plannerEntries(date).filter(entry => !S.plannerCategory || plannerCategoryKey(entry) === S.plannerCategory);
}

function plannerFlagIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="flag-cloth" d="M5 4c5-3 9 3 14 0v10c-5 3-9-3-14 0Z"/><path class="flag-pole" d="M5 3v18"/></svg>';
}

function plannerCategoryFilters() {
  const categories = plannerFilterCategories();
  if (S.plannerCategory && !categories.some(category => category.key === S.plannerCategory)) { S.plannerCategory = ''; S.plannerPage = 0; }
  const options = [{key:'',name:t('planner_all_tasks'),color:'#87947A'},...categories];
  return `<div class="planner-category-filters" role="group" aria-label="${esc(t('planner_filter_category'))}">${options.map(category => `<button type="button" class="planner-category-filter" data-action="planner-filter-category" data-category="${category.key}" style="--planner-color:${category.color}" aria-pressed="${(S.plannerCategory || '') === category.key}" aria-controls="planner-note-entries" title="${esc(category.name)}">${plannerFlagIcon()}<span>${esc(category.name)}</span></button>`).join('')}</div>`;
}

function plannerEntry(entry, date, compact = false) {
  const isHabit = entry.kind === 'habit', color = plannerEntryColor(entry);
  return `<article class="planner-entry ${entry.completed ? 'is-done' : ''} ${isHabit ? 'is-habit' : 'is-task'} ${compact ? 'compact' : ''}" style="--planner-color:${color}">
    ${compact ? '' : `<button class="planner-check" data-action="${isHabit ? 'toggle-habit' : 'planner-complete'}" data-id="${entry.id}" data-date="${date}" aria-label="${esc(t('record_progress') + ': ' + entry.name)}" aria-pressed="${entry.completed}" ${date > today() ? 'disabled' : ''}>${entry.completed ? icon('check') : ''}</button>`}
    <button class="planner-entry-content" data-action="${isHabit ? (entry.permission === 'owner' ? 'planner-edit-habit' : 'habit-detail') : 'planner-edit'}" data-id="${entry.id}" data-date="${date}"><strong>${esc(entry.name)}</strong><span>${entry.scheduled_time ? entry.scheduled_time.slice(0,5) + ' · ' : ''}${t('planner_'+entry.kind)}</span></button>
  </article>`;
}

const PLANNER_NOTE_LINES = 15;

// A long name consumes as many ruled lines as it needs, without splitting a task between pages.
function plannerNotePages(entries, lineCounts = []) {
  const pages = [[]]; let used = 0;
  entries.forEach((entry,index) => {
    const lines = Math.min(PLANNER_NOTE_LINES,Math.max(1,lineCounts[index] || 1));
    if (used + lines > PLANNER_NOTE_LINES) { pages.push([]); used = 0; }
    pages[pages.length-1].push({entry,lines}); used += lines;
  });
  return pages;
}

function plannerNoteTurn(date, page, pageCount, direction) {
  if (direction > 0 && page + 1 < pageCount) return {date,page:page+1};
  if (direction < 0 && page > 0) return {date,page:page-1};
  const next = shift(date,direction);
  if (next < '1000-01-01' || next > '9998-12-31') return {date,page};
  return {date:next,page:direction < 0 ? -1 : 0};
}

function plannerNoteRow(entry, date, lines = 1, measure = false) {
  const isHabit = entry.kind === 'habit', key = `${entry.kind}:${entry.id}`;
  const category = plannerEntryCategory(entry), tooltipId = `planner-category-${entry.kind}-${entry.id}`;
  const edit = isHabit ? (entry.permission === 'owner' ? 'planner-edit-habit' : 'habit-detail') : 'planner-edit';
  const disabled = date > today() || (isHabit && entry.permission === 'viewer');
  return `<div class="planner-note-row ${entry.completed ? 'is-done' : ''}" style="--planner-color:${category.color};--note-lines:${lines}" ${measure ? 'data-note-measure' : `data-note-entry="${key}"`}>
    ${measure ? '<span class="planner-note-check"></span>' : `<button class="planner-note-check" data-action="${isHabit ? 'toggle-habit' : 'planner-complete'}" data-id="${entry.id}" data-date="${date}" aria-label="${esc(t('record_progress')+': '+entry.name)}" aria-pressed="${entry.completed}" ${disabled ? 'disabled' : ''}>${entry.completed ? icon('check') : ''}</button>`}
    <span class="planner-note-category">${measure ? '' : `<button type="button" class="planner-note-flag" aria-label="${esc(t('category'))}" aria-describedby="${tooltipId}">${plannerFlagIcon()}</button><span class="planner-note-category-tooltip" role="tooltip" id="${tooltipId}">${esc(category.name)}</span>`}</span>
    ${measure ? `<span class="planner-note-name">${esc(entry.name)}</span>` : `<button class="planner-note-name" data-action="${edit}" data-id="${entry.id}" data-date="${date}">${esc(entry.name)}</button>`}
    <time class="planner-note-time">${entry.scheduled_time?.slice(0,5) || ''}</time>
  </div>`;
}

function plannerNoteSheet() {
  const filters = plannerCategoryFilters(), entries = plannerNoteEntries(S.date);
  return `<button class="planner-note-back" data-action="planner-calendar-toggle" aria-label="${esc(t('planner_open_month'))}" title="${esc(t('planner_open_month'))}">${icon('chevron','flip')}</button>
    <time class="planner-note-date" datetime="${S.date}">${esc(fmt(S.date,{day:'numeric',month:'short',year:'numeric'}))}</time>
    <h2 class="planner-note-title" id="planner-note-title" tabindex="-1">Tareas</h2>
    ${filters}
    <div class="planner-note-lines" id="planner-note-entries" aria-live="polite" aria-label="${esc(fmt(S.date,{dateStyle:'full'}))}"></div>
    <div class="planner-note-measure" aria-hidden="true">${entries.map(entry => plannerNoteRow(entry,S.date,1,true)).join('')}</div>
    <button class="planner-note-arrow previous" data-action="planner-note-prev" aria-label="${esc(t('planner_previous_sheet'))}">${icon('chevron','flip')}</button>
    <button class="planner-note-arrow next" data-action="planner-note-next" aria-label="${esc(t('planner_next_sheet'))}">${icon('chevron')}</button>
    <span class="planner-note-page" aria-live="polite"></span>`;
}

function plannerNoteMonth() {
  const first = (S.plannerMonth || S.date.slice(0,7))+'-01', start = monday(first);
  return `<button class="planner-note-back" data-action="planner-calendar-toggle" aria-label="${esc(t('planner_back_note'))}" title="${esc(t('planner_back_note'))}">${icon('chevron','flip')}</button>
    <button class="planner-note-today" data-action="today">${t('today')}</button>
    <h2 class="planner-note-title month-title" id="planner-note-title" tabindex="-1">${t('planner_month')}</h2>
    <div class="planner-note-calendar">
      <div class="planner-month-navigation">
        <button class="icon-btn" data-action="planner-month-prev" aria-label="${esc(t('previous'))}" ${first === '1000-01-01' ? 'disabled' : ''}>${icon('chevron','flip')}</button>
        <input type="month" id="planner-note-month" value="${first.slice(0,7)}" min="1000-01" max="9998-12" aria-label="${esc(t('select_date'))}">
        <button class="icon-btn" data-action="planner-month-next" aria-label="${esc(t('next'))}" ${first === '9998-12-01' ? 'disabled' : ''}>${icon('chevron')}</button>
      </div>
      <div class="planner-month-weekdays">${[1,2,3,4,5,6,7].map(n=>`<span>${esc(dayLabel(n))}</span>`).join('')}</div>
      <div class="planner-note-month-grid">${Array.from({length:42},(_,i)=>{
        const date = shift(start,i), count = plannerEntries(date).length;
        return `<button class="planner-month-date ${date.slice(0,7) !== first.slice(0,7) ? 'outside' : ''} ${date === S.date ? 'selected' : ''} ${date === today() ? 'is-today' : ''}" data-action="planner-note-date" data-date="${date}" aria-label="${esc(fmt(date,{dateStyle:'full'})+' · '+t('planner_count',{count}))}" ${date === today() ? 'aria-current="date"' : ''} ${date < '1000-01-01' || date > '9998-12-31' ? 'disabled' : ''}><span>${Number(date.slice(8))}</span>${count ? '<i aria-hidden="true"></i>' : ''}</button>`;
      }).join('')}</div>
    </div>`;
}

function calendarPage() {
  return renderTemplate('calendar', {
    title:esc(t('calendar')), addLabel:t('planner_add'), addIcon:icon('plus'), todayLabel:t('today'),
    mode:S.plannerMode || 'note', content:S.plannerMode === 'month' ? plannerNoteMonth() : plannerNoteSheet(),
  });
}

class CalendarPage extends PageController {
  constructor() {
    super(['date-prev','date-next','today','pick-date','calendar-date','planner-calendar-toggle','planner-month-prev','planner-month-next','planner-note-date','planner-note-prev','planner-note-next','planner-filter-category','planner-add','planner-edit','planner-delete','planner-delete-habit','planner-edit-habit','planner-complete']);
    document.addEventListener('change',event => {
      if (event.target.id !== 'planner-note-month' || !/^\d{4}-\d{2}$/.test(event.target.value) || !event.target.validity.valid) return;
      S.plannerMonth = event.target.value; render(); $('#planner-note-month')?.focus({preventScroll:true});
    });
    document.addEventListener('keydown',async event => {
      if (event.target.matches?.('.planner-section-tabs [role=tab]') && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
        event.preventDefault();
        const view = event.key === 'Home' ? 'calendar' : event.key === 'End' ? 'habits' : S.view === 'calendar' ? 'habits' : 'calendar';
        await navigate(view); $(`#planner-section-${view}`).focus(); return;
      }
    });
  }

  unmount() {
    this.noteObserver?.disconnect();
    this.noteObserver = null;
  }

  mount() {
    this.unmount();
    const note = $('.planner-note[data-mode="note"]');
    if (!note) return;
    const entries = plannerNoteEntries(S.date);
    const layout = () => {
      if (!note.isConnected) return;
      const lineHeight = $('.planner-note-lines',note).getBoundingClientRect().height / PLANNER_NOTE_LINES;
      const counts = $$('[data-note-measure] .planner-note-name',note).map(el => Math.max(1,Math.ceil((el.getBoundingClientRect().height-1)/lineHeight)));
      this.notePages = plannerNotePages(entries,counts);
      const last = this.notePages.length-1;
      S.plannerPage = S.plannerPage === -1 ? last : Math.min(last,Math.max(0,S.plannerPage || 0));
      const content = this.notePages[S.plannerPage].map(({entry,lines})=>plannerNoteRow(entry,S.date,lines)).join('') || (S.plannerCategory ? `<p class="planner-note-empty">${esc(t('planner_category_empty'))}</p>` : '');
      const list = $('.planner-note-lines',note);
      if (list.innerHTML !== content) list.innerHTML = content;
      const pageLabel = t('planner_sheet_count',{page:S.plannerPage+1,count:this.notePages.length});
      $('.planner-note-page',note).textContent = this.notePages.length > 1 ? pageLabel : '';
      note.setAttribute('aria-label',`${fmt(S.date,{dateStyle:'full'})} · ${pageLabel}`);
      $('[data-action="planner-note-prev"]',note).disabled = S.date === '1000-01-01' && S.plannerPage === 0;
      $('[data-action="planner-note-next"]',note).disabled = S.date === '9998-12-31' && S.plannerPage === last;
    };
    layout();
    let width = note.clientWidth;
    this.noteObserver = new ResizeObserver(() => { if (note.clientWidth !== width) { width = note.clientWidth; layout(); } });
    this.noteObserver.observe(note);
  }

  async handleAction(action, el, id) {
    if (action === 'planner-filter-category') {
      const category = el.dataset.category || '';
      if (category && !plannerFilterCategories().some(item => item.key === category)) return;
      const scroll = $('.planner-category-filters')?.scrollLeft || 0;
      S.plannerCategory = category; S.plannerPage = 0;
      render();
      const filters = $('.planner-category-filters');
      if (filters) filters.scrollLeft = scroll;
      $('.planner-category-filter[aria-pressed="true"]')?.focus({preventScroll:true});
      return;
    }
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
    let focus = null;
    if (action === 'planner-calendar-toggle') {
      S.plannerMode = S.plannerMode === 'month' ? 'note' : 'month';
      S.plannerMonth = S.date.slice(0,7); focus = '#planner-note-title';
    }
    if (['planner-month-prev','planner-month-next'].includes(action)) {
      const date = dateObj((S.plannerMonth || S.date.slice(0,7))+'-01');
      date.setUTCMonth(date.getUTCMonth()+(action.endsWith('next') ? 1 : -1));
      const month = iso(date).slice(0,7);
      if (month >= '1000-01' && month <= '9998-12') S.plannerMonth = month;
      focus = `[data-action="${action}"]`;
    }
    if (['planner-note-prev','planner-note-next'].includes(action)) {
      const next = plannerNoteTurn(S.date,S.plannerPage || 0,this.notePages?.length || 1,action.endsWith('next') ? 1 : -1);
      S.date = next.date; S.plannerPage = next.page; focus = `[data-action="${action}"]`;
    }
    if (['pick-date','calendar-date','planner-note-date'].includes(action)) {
      S.date = el.dataset.date; S.plannerPage = 0; S.plannerMode = 'note';
      if (action !== 'pick-date') S.view = 'calendar';
      focus = '#planner-note-title';
    }
    if (action === 'today') { S.date = today(); S.plannerPage = 0; S.plannerMode = 'note'; }
    if (['date-prev','date-next'].includes(action)) { S.date = shift(S.date,action === 'date-next' ? 1 : -1); S.plannerPage = 0; }
    S.month = S.date.slice(0,7); render();
    if (focus) $(focus)?.focus({preventScroll:true});
  }
}
