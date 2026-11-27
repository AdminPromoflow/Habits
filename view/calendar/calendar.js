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
  const sourceItem = value.source_item_id ? items.find(item=>Number(item.id) === Number(value.source_item_id))
    : value.source_diagram_id && items.find(item=>Number(item.diagram_id) === Number(value.source_diagram_id));
  const current = sourceItem ? (sourceItem.parent_id ? `folder:${sourceItem.parent_id}` : `space:${sourceItem.mindspace_id}`) : null;
  const folder = sourceItem?.parent_id && items.find(item=>Number(item.id) === Number(sourceItem.parent_id));
  const parent = folder ? (folder.parent_id ? `folder:${folder.parent_id}` : `space:${folder.mindspace_id}`) : null;
  const nearby = [[current,'planner_current_folder'],[parent,'planner_parent_folder']].filter(([key])=>key && folders.has(key)).map(([key,label])=>[key,`${t(label)} — ${folders.get(key)}`]);
  const categoryKey = category => category.source_folder_id && folders.has(`folder:${category.source_folder_id}`) ? `folder:${category.source_folder_id}` : category.source_mindspace_id && folders.has(`space:${category.source_mindspace_id}`) ? `space:${category.source_mindspace_id}` : `category:${category.id}`;
  const categories = [...new Map([...(data.categories || []),...(S.data.category_catalog || [])].map(category=>[Number(category.id),category])).values()];
  const selectedCategory = categories.find(category=>Number(category.id) === Number(value.category_id));
  const selected = selectedCategory ? categoryKey(selectedCategory) : existing ? (value.kind === 'task' ? 'none' : 'default') : current || 'default';
  return {selected, groups:[
    [null,[['default',t('calendar')],...(existing && value.kind === 'task' && !value.category_id ? [['none',t('planner_no_category')]] : [])]],
    [value.source_item_id ? 'planner_board_folders' : 'planner_nearby_folders',nearby],
    ['planner_other_folders',[...folders].filter(([key])=>!nearby.some(([near])=>near === key)).sort((a,b)=>a[1].localeCompare(b[1]))],
    ['planner_existing_categories',categories.filter(category=>categoryKey(category).startsWith('category:')).map(category=>[`category:${category.id}`,categoryName(category)]).sort((a,b)=>a[1].localeCompare(b[1]))],
    [null,[['new',`+ ${t('new_category')}`]]]
  ]};
}

function plannerCategoryFields(value, existing) {
  const {selected,groups} = plannerCategoryOptions(value,existing);
  return `<label class="field"><span>${t('category')}</span><select name="category_choice" aria-label="${esc(t('category'))}">${groups.filter(([,options])=>options.length).map(([label,options])=>`${label ? `<optgroup label="${esc(t(label))}">` : ''}${options.map(([key,name])=>`<option value="${esc(key)}" ${key === selected ? 'selected' : ''}>${esc(name)}</option>`).join('')}${label ? '</optgroup>' : ''}`).join('')}</select></label><div data-new-planner-category hidden><div class="form-grid">${field('new_category_name','planner_new_category_name','text','',{maxlength:100})}${field('new_category_color','color','color','#B8A4D4')}</div></div>`;
}

function plannerScheduleFields(entry = {}, kind = null) {
  const recurrence = entry.recurrence === 'pending' ? (kind === 'task' ? 'once' : 'weekly') : entry.recurrence || (kind === 'habit' ? 'weekly' : 'once');
  const start = entry.start_date || S.date || today(), rule = plannerRule(entry);
  const days = entry.recurrence !== 'pending' && Array.isArray(entry.schedule_days) ? entry.schedule_days : [dayNum(start)];
  const frequency = recurrence === 'once' ? 'weekly' : recurrence;
  return `<div class="planner-schedule" ${entry.recurrence === 'pending' ? 'hidden' : ''} ${kind ? 'data-quick-schedule' : ''} ${kind && recurrence !== 'once' && kind === 'task' ? 'data-legacy-repeat' : ''}>
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

function plannerPendingField(entry = {}) {
  return `<label class="planner-pending-option"><input type="checkbox" data-planner-pending ${entry.recurrence === 'pending' ? 'checked' : ''}><span><strong>${t('planner_pending')}</strong><small>${t('planner_pending_hint')}</small></span></label>`;
}

function bindPlannerSchedule(form) {
  const schedule = $('.planner-schedule',form);
  const sync = () => {
    const pending = !!$('[data-planner-pending]',form)?.checked;
    schedule.hidden = pending;
    $$('input,select,button',schedule).forEach(input => { input.disabled = pending && !['recurrence','recurrence_rule'].includes(input.name); });
    const quick = schedule.hasAttribute('data-quick-schedule');
    const repeat = quick ? ($('[name=kind]:checked',form)?.value === 'habit' || schedule.hasAttribute('data-legacy-repeat')) : $('[name=schedule_mode]:checked',form).value === 'repeat';
    const frequency = $('[name=repeat_frequency]:checked',form).value;
    const monthMode = $('[name=month_mode]:checked',form).value;
    $('[name=recurrence]',form).value = pending ? 'pending' : repeat ? frequency : 'once';
    const visible = {repeat:repeat,week:repeat && frequency === 'weekly',year:repeat && frequency === 'yearly',month:repeat && ['monthly','yearly'].includes(frequency)};
    for (const [section,show] of Object.entries(visible)) $(`[data-${section}-fields]`,form).hidden = !show;
    $('[data-month-interval]',form).hidden = !repeat || frequency !== 'monthly';
    $('[data-month-dates]',form).hidden = monthMode !== 'dates';
    $('[data-month-weekdays]',form).hidden = monthMode !== 'weekdays';
    $('[data-end-field]',form).hidden = !repeat;
    $('[name=end_date]',form).disabled = pending || !repeat;
    $('[name=end_date]',form).min = $('[name=start_date]',form).value;
    if (quick) $('[name=start_date]',form).previousElementSibling.textContent = t(repeat ? 'start_date' : 'planner_on_date');
    const selected = name => $$(`[name=${name}]:checked`,form).map(input=>Number(input.value));
    const rule = visible.month ? {month_mode:monthMode,...(monthMode === 'dates' ? {month_days:selected('rule_month_days')} : {positions:selected('rule_positions'),weekdays:selected('rule_weekdays')}),...(frequency === 'yearly' ? {months:selected('rule_months')} : {interval:Number($('[name=rule_interval]',form).value)})} : null;
    $('[name=recurrence_rule]',form).value = JSON.stringify(pending ? null : rule);
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
    ${plannerPendingField(value)}
    ${plannerScheduleFields(value,entry && kind === 'habit' && entry.recurrence === 'once' ? null : kind)}
    <details class="planner-description" ${value.description ? 'open' : ''}><summary>${t('planner_optional_description')}</summary>${textarea('description','description',value.description || '')}</details>
    ${entry?.recurrence && !['once','pending'].includes(entry.recurrence) ? `<p class="field-help">${t('planner_edit_series')}</p>` : ''}
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
    $('[name=new_category_color]',form).disabled = !isNew;
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
    // Existing activities keep their link even if the original node or card was removed.
    const source=!entry ? defaults : null;
    if (source?.source_diagram_id) { data.source_diagram_id=source.source_diagram_id; data.source_node_key=source.source_node_key; }
    if (source?.source_item_id) { data.source_item_id=source.source_item_id; data.source_card_key=source.source_card_key; }
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
  const saved = S.data.calendar?.orders?.[date], order = new Map((Array.isArray(saved) ? saved : []).map((key,index) => [key,index]));
  return [...habits,...tasks].sort((a,b) => (order.get(plannerEntryKey(a)) ?? Infinity) - (order.get(plannerEntryKey(b)) ?? Infinity)
    || (a.scheduled_time || '').localeCompare(b.scheduled_time || '') || a.name.localeCompare(b.name));
}

function plannerEntryKey(entry) { return `${entry.kind}:${entry.id}`; }

// Reorder the visible entries in their existing slots, preserving every hidden category.
function plannerMovedOrder(entries, visible, source, target, after = false) {
  const keys = entries.map(plannerEntryKey), selected = new Set(visible);
  const moving = keys.filter(key => selected.has(key));
  if (source === target || !moving.includes(source) || !moving.includes(target)) return keys;
  moving.splice(moving.indexOf(source),1);
  moving.splice(moving.indexOf(target) + Number(after),0,source);
  let index = 0;
  return keys.map(key => selected.has(key) ? moving[index++] : key);
}

let plannerColorCache = {signature:'', colors:new Map()};
function plannerCategoryColors() {
  const categories = new Map([...(S.data.category_catalog || []),...(S.data.categories || [])].map(category => [String(Number(category.id)),category.color]));
  for (const entry of [...(S.data.calendar?.tasks || []),...(S.data.habits || [])]) {
    const key = plannerCategoryKey(entry);
    if (!categories.has(key)) categories.set(key,entry.color);
  }
  const entries = [...categories].sort(([a],[b]) => a === 'none' ? -1 : b === 'none' ? 1 : a.localeCompare(b,'en',{numeric:true}));
  const signature = JSON.stringify(entries);
  if (plannerColorCache.signature === signature) return plannerColorCache.colors;
  const normalize = color => /^#[0-9a-f]{6}$/i.test(color || '') ? color.toUpperCase() : null;
  const reserved = new Set(entries.map(([,color]) => normalize(color))), used = new Set(['#87947A']);
  const palette = ['#C75B7A','#498FB5','#E0A33F','#6AA56B','#9270BE','#DA7950','#42A59E','#BD6AA4','#889C41','#657EC5','#B58554','#499C81'];
  const colors = new Map(); let next = 0;
  const generated = index => {
    const hue = (index * 137.508) % 360, saturation = .58 + (Math.floor(index / 360) % 4) * .08, light = .52 + (Math.floor(index / 1440) % 4) * .06;
    const channel = n => { const k = (n + hue / 30) % 12; return Math.round(255 * (light - saturation * Math.min(light,1-light) * Math.max(-1,Math.min(k-3,9-k,1)))).toString(16).padStart(2,'0'); };
    return `#${channel(0)}${channel(8)}${channel(4)}`.toUpperCase();
  };
  for (const [key,preferred] of entries) {
    let color = normalize(preferred);
    if (!color || used.has(color)) {
      do { color = next < palette.length ? palette[next] : generated(next - palette.length); next++; }
      while (used.has(color) || reserved.has(color));
    }
    colors.set(key,color); used.add(color);
  }
  plannerColorCache = {signature,colors};
  return colors;
}

function plannerEntryCategory(entry) {
  const category = [...(S.data.categories || []),...(S.data.category_catalog || [])].find(item => Number(item.id) === Number(entry.category_id));
  // Shared habits carry their category name and color even outside the personal catalog.
  return {
    name:(category ? categoryName(category) : habitCategory(entry)) || t('planner_no_category'),
    color:plannerCategoryColors().get(plannerCategoryKey(entry)) || '#B8A4D4',
  };
}

function plannerEntryColor(entry) {
  return plannerEntryCategory(entry).color;
}

function plannerCategoryKey(entry) {
  return entry.category_id ? String(Number(entry.category_id)) : 'none';
}

function plannerCategoryStorageKey() {
  return `planner-category-selection:${new URL(location.href).pathname}:${S.user.id}`;
}

function restorePlannerCategorySelection() {
  S.plannerHiddenCategories = [];
  if (!S.user) return;
  try {
    const saved = JSON.parse(localStorage.getItem(plannerCategoryStorageKey()) || '[]');
    if (Array.isArray(saved)) S.plannerHiddenCategories = [...new Set(saved.filter(key => typeof key === 'string' && /^(?:none|[1-9][0-9]*)$/.test(key)))];
  } catch {}
}

function savePlannerCategorySelection() {
  if (!S.user) return;
  try { localStorage.setItem(plannerCategoryStorageKey(), JSON.stringify(S.plannerHiddenCategories)); } catch {}
}

function plannerFilterCategories() {
  const categories = new Map();
  // Use the day's unfiltered entries so a deselected category can be enabled again.
  for (const entry of plannerEntries(S.date)) {
    const key = plannerCategoryKey(entry);
    if (!categories.has(key)) categories.set(key,plannerEntryCategory(entry));
  }
  return [...categories].map(([key,category]) => ({key,...category})).sort((a,b) => a.name.localeCompare(b.name,S.language));
}

function plannerNoteEntries(date) {
  return plannerEntries(date).filter(entry => !S.plannerHiddenCategories.includes(plannerCategoryKey(entry)));
}

function plannerFlagIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="flag-cloth" d="M5 4c5-3 9 3 14 0v10c-5 3-9-3-14 0Z"/><path class="flag-pole" d="M5 3v18"/></svg>';
}

function plannerCategoryFilters() {
  const categories = plannerFilterCategories();
  const arrow = direction => `<button type="button" class="planner-category-scroll" data-action="planner-categories-${direction}" aria-label="${esc(t(`planner_categories_${direction}`))}" aria-controls="planner-category-filters" hidden disabled>${icon('chevron',direction === 'left' ? 'flip' : '')}</button>`;
  return `<div class="planner-category-bar">${arrow('left')}<div class="planner-category-filters" id="planner-category-filters" role="group" aria-label="${esc(t('planner_filter_category'))}">${categories.map(category => `<button type="button" class="planner-category-filter" data-action="planner-filter-category" data-category="${category.key}" style="--planner-color:${category.color}" aria-pressed="${!S.plannerHiddenCategories.includes(category.key)}" aria-controls="planner-note-entries" title="${esc(category.name)}">${plannerFlagIcon()}<span>${esc(category.name)}</span></button>`).join('')}</div>${arrow('right')}</div>`;
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
    ${measure ? `<span class="planner-note-name">${esc(entry.name)}</span>` : `<button class="planner-note-name" data-action="${edit}" data-id="${entry.id}" data-date="${date}" title="${esc(t('planner_drag_hint'))}">${esc(entry.name)}</button>`}
    <time class="planner-note-time">${entry.scheduled_time?.slice(0,5) || ''}</time>
    ${measure ? '<span class="planner-drag-handle"></span>' : `<button type="button" class="planner-drag-handle" data-planner-drag aria-label="${esc(t('planner_reorder', {name:entry.name}))}" title="${esc(t('planner_drag_hint'))}"><span aria-hidden="true">⠿</span></button>`}
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

function plannerPendingEntries() {
  return [
    ...(S.data.calendar?.tasks || []).map(entry => ({...entry,kind:'task'})),
    ...(S.data.habits || []).filter(entry => entry.status === 'active' && entry.permission !== 'viewer').map(entry => ({...entry,kind:'habit'})),
  ].filter(entry => entry.recurrence === 'pending').sort((a,b) => a.name.localeCompare(b.name,S.language));
}

function plannerPendingsPage() {
  const groups = new Map();
  for (const entry of plannerPendingEntries()) {
    const key = plannerCategoryKey(entry);
    if (!groups.has(key)) groups.set(key,{...plannerEntryCategory(entry),entries:[]});
    groups.get(key).entries.push(entry);
  }
  const add = `<button class="btn primary" data-action="planner-add" data-pending="true">${icon('plus')}${t('planner_add')}</button>`;
  return renderTemplate('pendings', {
    heading:heading(t('planner_pendings'),t('planner_pendings_intro'),add),
    content:groups.size ? [...groups.values()].sort((a,b) => a.name.localeCompare(b.name,S.language)).map(group => `<section class="planner-pending-group" style="--planner-color:${group.color}"><h2>${plannerFlagIcon()}<span>${esc(group.name)}</span><small>${group.entries.length}</small></h2><div class="planner-pending-list">${group.entries.map(entry => {
      const edit = entry.kind === 'task' ? 'planner-edit' : entry.permission === 'owner' ? 'planner-edit-habit' : 'habit-detail';
      return `<button type="button" class="planner-pending-entry" data-action="${edit}" data-id="${entry.id}">${icon(entry.kind === 'habit' ? 'habits' : 'calendar')}<span><strong>${esc(entry.name)}</strong><small>${t('planner_'+entry.kind)}</small></span>${icon('chevron')}</button>`;
    }).join('')}</div></section>`).join('') : empty('planner_no_pendings','planner_no_pendings_hint',add),
  });
}

class CalendarPage extends PageController {
  constructor() {
    super(['date-prev','date-next','today','pick-date','calendar-date','planner-calendar-toggle','planner-month-prev','planner-month-next','planner-note-date','planner-note-prev','planner-note-next','planner-filter-category','planner-categories-left','planner-categories-right','planner-add','planner-edit','planner-delete','planner-delete-habit','planner-edit-habit','planner-complete']);
    document.addEventListener('scroll',event => {
      if (event.target.matches?.('.planner-category-filters')) this.updateCategoryArrows();
    }, true);
    document.addEventListener('change',event => {
      if (event.target.id !== 'planner-note-month' || !/^\d{4}-\d{2}$/.test(event.target.value) || !event.target.validity.valid) return;
      S.plannerMonth = event.target.value; render(); $('#planner-note-month')?.focus({preventScroll:true});
    });
    document.addEventListener('keydown',async event => {
      if (event.key === 'Escape' && this.drag) { event.preventDefault(); this.cancelDrag(); return; }
      const row = event.target.closest?.('[data-note-entry]');
      if (row && event.altKey && ['ArrowUp','ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const entries = plannerNoteEntries(S.date), keys = entries.map(plannerEntryKey), index = keys.indexOf(row.dataset.noteEntry);
        const target = keys[index + (event.key === 'ArrowUp' ? -1 : 1)];
        if (target) await this.reorder(row.dataset.noteEntry,target,event.key === 'ArrowDown');
        return;
      }
      if (event.target.matches?.('.planner-section-tabs [role=tab]') && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
        event.preventDefault();
        const view = event.key === 'Home' ? 'calendar' : event.key === 'End' ? 'pendings' : S.view === 'calendar' ? 'pendings' : 'calendar';
        await navigate(view); $(`#planner-section-${view}`).focus(); return;
      }
    });
    document.addEventListener('pointerdown',event => this.startDrag(event));
    document.addEventListener('pointermove',event => this.moveDrag(event), {passive:false});
    document.addEventListener('pointerup',event => {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      const drag = this.drag;
      this.cancelDrag();
      if (drag.started && drag.target && drag.date === S.date && drag.user === S.user?.id) void this.reorder(drag.key,drag.target,drag.after);
    });
    document.addEventListener('pointercancel',event => { if (event.pointerId === this.drag?.pointerId) this.cancelDrag(); });
    document.addEventListener('click',event => {
      if (Date.now() < (this.suppressClickUntil || 0) && event.target.closest?.('.planner-note')) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
    }, true);
  }

  unmount() {
    this.cancelDrag();
    this.noteObserver?.disconnect();
    this.noteObserver = null;
    this.layoutNote = null;
  }

  isEditing() { return !!this.drag?.started || !!this.savingOrder; }

  updateCategoryArrows() {
    const bar = $('.planner-category-bar'), filters = $('.planner-category-filters');
    if (!bar || !filters) return;
    // Measure against the full bar before reserving room for the arrows.
    const overflow = filters.scrollWidth > bar.clientWidth + 1;
    bar.classList.toggle('is-overflowing',overflow);
    const left = $('[data-action="planner-categories-left"]',bar), right = $('[data-action="planner-categories-right"]',bar);
    left.hidden = left.disabled = !overflow || filters.scrollLeft <= 1;
    right.hidden = right.disabled = !overflow || filters.scrollLeft >= filters.scrollWidth - filters.clientWidth - 1;
    S.plannerCategoryScroll = filters.scrollLeft;
  }

  startDrag(event) {
    if (S.view !== 'calendar' || S.busy || this.savingOrder || event.button !== 0 || event.isPrimary === false) return;
    const handle = event.target.closest?.('.planner-note-name,[data-planner-drag]'), row = handle?.closest('[data-note-entry]');
    if (!row || (event.pointerType !== 'mouse' && !handle.matches('[data-planner-drag]'))) return;
    this.cancelDrag();
    this.drag = {key:row.dataset.noteEntry, row, note:row.closest('.planner-note'), date:S.date, user:S.user?.id,
      pointerId:event.pointerId, startX:event.clientX, startY:event.clientY};
  }

  moveDrag(event) {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.started && Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY) < 6) return;
    event.preventDefault();
    if (!drag.started) {
      drag.started = true;
      const rect = drag.row.getBoundingClientRect();
      drag.offsetX = drag.startX - rect.left; drag.offsetY = Math.min(drag.startY - rect.top,30);
      const ghost = document.createElement('div');
      ghost.className = 'planner-drag-preview'; ghost.setAttribute('aria-hidden','true');
      ghost.textContent = drag.row.querySelector('.planner-note-name').textContent;
      ghost.style.width = `${rect.width}px`;
      ghost.style.borderLeftColor = plannerEntryColor(plannerNoteEntries(S.date).find(entry=>plannerEntryKey(entry)===drag.key));
      document.body.append(ghost); drag.ghost = ghost;
      drag.row.classList.add('is-dragging'); document.body.classList.add('planner-is-dragging');
      drag.note.setPointerCapture?.(event.pointerId);
    }
    drag.ghost.style.left = `${event.clientX-drag.offsetX}px`; drag.ghost.style.top = `${event.clientY-drag.offsetY}px`;
    this.dragTarget(event.clientX,event.clientY);
  }

  dragTarget(x, y) {
    const drag = this.drag;
    if (!drag?.started) return;
    $$('[data-planner-drop]').forEach(row=>row.removeAttribute('data-planner-drop'));
    drag.target = null;
    const arrow = document.elementFromPoint(x,y)?.closest('.planner-note-arrow');
    const direction = arrow?.classList.contains('next') ? 1 : arrow ? -1 : 0;
    if (direction !== drag.turn) {
      clearTimeout(drag.turnTimer); drag.turn = direction;
      const next = (S.plannerPage || 0) + direction;
      if (direction && next >= 0 && next < (this.notePages?.length || 0)) drag.turnTimer = setTimeout(()=>{
        if (this.drag !== drag) return;
        S.plannerPage = next; this.layoutNote?.(); drag.turn = 0; this.dragTarget(x,y);
      },650);
    }
    const list = $('#planner-note-entries'), rect = list?.getBoundingClientRect();
    if (!rect || x < rect.left-20 || x > rect.right+20 || y < rect.top-12 || y > rect.bottom+12 || arrow) return;
    const rows = $$('[data-note-entry]',list).filter(row=>row.dataset.noteEntry !== drag.key);
    const target = rows.find(row=>{const box=row.getBoundingClientRect();return y < box.top+box.height/2;}) || rows.at(-1);
    if (!target) return;
    const box = target.getBoundingClientRect();
    drag.target = target.dataset.noteEntry; drag.after = y >= box.top+box.height/2;
    target.setAttribute('data-planner-drop',drag.after ? 'after' : 'before');
  }

  cancelDrag() {
    const drag = this.drag;
    if (!drag) return;
    clearTimeout(drag.turnTimer);
    if (drag.note.hasPointerCapture?.(drag.pointerId)) drag.note.releasePointerCapture(drag.pointerId);
    drag.ghost?.remove(); drag.row.classList.remove('is-dragging');
    document.body.classList.remove('planner-is-dragging');
    $$('[data-planner-drop]').forEach(row=>row.removeAttribute('data-planner-drop'));
    if (drag.started) this.suppressClickUntil = Date.now()+350;
    this.drag = null;
  }

  async reorder(source, target, after) {
    if (S.busy || this.savingOrder) return;
    const date = S.date, user = S.user?.id, entries = plannerEntries(date);
    const order = plannerMovedOrder(entries,plannerNoteEntries(date).map(plannerEntryKey),source,target,after);
    if (order.every((key,index)=>key === plannerEntryKey(entries[index]))) return;
    const calendar = S.data.calendar, previous = calendar.orders?.[date];
    calendar.orders ||= {}; calendar.orders[date] = order;
    this.savingOrder = true; S.busy = true;
    const show = () => {
      if (S.user?.id !== user || S.view !== 'calendar' || S.date !== date) return;
      render();
      const page = this.notePages?.findIndex(rows=>rows.some(({entry})=>plannerEntryKey(entry)===source));
      if (page >= 0) { S.plannerPage = page; this.layoutNote?.(); }
      $(`[data-note-entry="${source}"] [data-planner-drag]`)?.focus({preventScroll:true});
    };
    show();
    try {
      await this.makeRequest('saveCalendarOrder',{date,order});
      if (S.user?.id === user) toast(t('planner_order_saved'));
    } catch (error) {
      if (S.user?.id === user) {
        if (previous) S.data.calendar.orders[date] = previous; else delete S.data.calendar.orders[date];
        show(); toast(error.message,true);
      }
    } finally {
      this.savingOrder = false;
      S.busy = false;
    }
  }

  mount() {
    this.unmount();
    const note = $('.planner-note[data-mode="note"]');
    if (!note) return;
    const entries = plannerNoteEntries(S.date);
    const categories = plannerFilterCategories();
    const emptyMessage = categories.length && S.plannerHiddenCategories.length ? t(categories.some(category => !S.plannerHiddenCategories.includes(category.key)) ? 'planner_category_empty' : 'planner_categories_none') : '';
    const layout = () => {
      if (!note.isConnected) return;
      const lineHeight = $('.planner-note-lines',note).getBoundingClientRect().height / PLANNER_NOTE_LINES;
      const counts = $$('[data-note-measure] .planner-note-name',note).map(el => Math.max(1,Math.ceil((el.getBoundingClientRect().height-1)/lineHeight)));
      this.notePages = plannerNotePages(entries,counts);
      const last = this.notePages.length-1;
      S.plannerPage = S.plannerPage === -1 ? last : Math.min(last,Math.max(0,S.plannerPage || 0));
      const content = this.notePages[S.plannerPage].map(({entry,lines})=>plannerNoteRow(entry,S.date,lines)).join('') || (emptyMessage ? `<p class="planner-note-empty">${esc(emptyMessage)}</p>` : '');
      const list = $('.planner-note-lines',note);
      if (list.innerHTML !== content) list.innerHTML = content;
      const pageLabel = t('planner_sheet_count',{page:S.plannerPage+1,count:this.notePages.length});
      $('.planner-note-page',note).textContent = this.notePages.length > 1 ? pageLabel : '';
      note.setAttribute('aria-label',`${fmt(S.date,{dateStyle:'full'})} · ${pageLabel}`);
      $('[data-action="planner-note-prev"]',note).disabled = S.date === '1000-01-01' && S.plannerPage === 0;
      $('[data-action="planner-note-next"]',note).disabled = S.date === '9998-12-31' && S.plannerPage === last;
    };
    this.layoutNote = layout;
    layout();
    const filters = $('.planner-category-filters',note), scroll = S.plannerCategoryScroll;
    this.updateCategoryArrows();
    filters.scrollLeft = scroll;
    this.updateCategoryArrows();
    let width = note.clientWidth;
    this.noteObserver = new ResizeObserver(() => {
      if (note.clientWidth !== width) { width = note.clientWidth; layout(); }
      this.updateCategoryArrows();
    });
    this.noteObserver.observe(note);
    this.noteObserver.observe(filters);
  }

  async handleAction(action, el, id) {
    if (['planner-categories-left','planner-categories-right'].includes(action)) {
      const filters = $('.planner-category-filters');
      if (filters) filters.scrollBy({left:(action.endsWith('right') ? 1 : -1) * Math.max(100,filters.clientWidth * .75),
        behavior:typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
      return;
    }
    if (action === 'planner-filter-category') {
      const category = el.dataset.category;
      if (!plannerFilterCategories().some(item => item.key === category)) return;
      S.plannerCategoryScroll = $('.planner-category-filters')?.scrollLeft || 0;
      S.plannerHiddenCategories = S.plannerHiddenCategories.includes(category)
        ? S.plannerHiddenCategories.filter(key => key !== category) : [...S.plannerHiddenCategories,category];
      savePlannerCategorySelection();
      S.plannerPage = 0;
      render();
      $(`.planner-category-filter[data-category="${category}"]`)?.focus({preventScroll:true});
      return;
    }
    if (action === 'planner-add') return plannerForm(null,{start_date:el.dataset.date || S.date,scheduled_time:el.dataset.time || '',category_id:el.dataset.category || null,...(el.dataset.pending === 'true' || S.view === 'pendings' ? {recurrence:'pending'} : {})});
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
