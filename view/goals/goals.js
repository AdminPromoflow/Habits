function goalIdsForEntry(entry = {}) {
  const kind = entry.kind || 'habit';
  return [...new Set((S.data.goals?.links || []).filter(link =>
    link.kind === kind && Number(link.id) === Number(entry.id) ||
    link.kind === 'card' && Number(link.item_id) === Number(entry.source_item_id || entry.item_id) && link.card_key === (entry.source_card_key || entry.card_key)
  ).map(link => Number(link.goal_id)))];
}

function goalPicker(entry = {}) {
  const selected = new Set(goalIdsForEntry(entry)), goals = S.data.goals?.items || [];
  return `<fieldset class="goal-picker" data-goal-picker><legend>${t('goals_label')} <small>${t('optional')}</small></legend>
    <p class="field-help">${t('goals_picker_hint')}</p>
    <div class="goal-picker-options">${goals.map(goal => `<label><input type="checkbox" name="goal_ids" value="${goal.id}" ${selected.has(Number(goal.id)) ? 'checked' : ''}><span>${esc(goal.name)}${goal.status === 'completed' ? ` <small>· ${t('goals_achieved')}</small>` : ''}</span></label>`).join('') || `<p class="muted">${t('goals_picker_empty')}</p>`}</div>
    <details class="goal-quick-create"><summary>${t('goals_new')}</summary><div><input type="text" data-goal-name maxlength="190" aria-label="${esc(t('goals_name'))}" placeholder="${esc(t('goals_name'))}"><button type="button" class="btn secondary" data-action="goal-quick-create">${t('create')}</button></div><p class="form-error" role="alert" data-goal-error></p></details>
  </fieldset>`;
}

// Count recorded completions, not a guess based on today's schedule. A recurring
// task contributes once per completed date; its board card is not counted again.
function goalsReport(range = null, data = S.data) {
  const tasks = new Map((data.calendar?.tasks || []).map(entry => [Number(entry.id), {...entry, kind:'task'}]));
  const habits = new Map((data.habits || []).filter(entry => entry.permission !== 'viewer').map(entry => [Number(entry.id), {...entry, kind:'habit'}]));
  const cards = new Map();
  for (const item of data.mindspace?.items || []) {
    if (!['kanban','scrum'].includes(item.kind)) continue;
    for (const card of item.content?.cards || []) cards.set(`${item.id}:${card.id}`, {...card, item_id:item.id, kind:'card', name:card.title});
  }
  const logs = new Map();
  const addLog = (key,date) => { if (!logs.has(key)) logs.set(key,new Set()); logs.get(key).add(date); };
  for (const log of data.calendar?.completions || []) addLog(`task:${log.task_id}`,log.completed_on);
  for (const log of data.completions || []) if (Number(log.amount) >= Number(log.goal_at_time)) addLog(`habit:${log.habit_id}`,log.completed_on);
  const inRange = date => date && date <= (data.today || today()) && (!range || date >= range.start && date <= range.end);
  const links = data.goals?.links || [];
  return (data.goals?.items || []).map(goal => {
    const groups = new Map(), ownLinks = links.filter(link => Number(link.goal_id) === Number(goal.id));
    for (const link of ownLinks.filter(link => link.kind !== 'card')) {
      const entry = (link.kind === 'task' ? tasks : habits).get(Number(link.id));
      if (!entry || range?.category && String(entry.category_id || 'none') !== range.category) continue;
      const key = entry.source_item_id && entry.source_card_key ? `card:${entry.source_item_id}:${entry.source_card_key}` : `${entry.kind}:${entry.id}`;
      if (!groups.has(key)) groups.set(key,{key,entry,dates:new Set()});
      for (const date of logs.get(`${entry.kind}:${entry.id}`) || []) if (inRange(date)) groups.get(key).dates.add(date);
    }
    for (const link of ownLinks.filter(link => link.kind === 'card')) {
      const key = `card:${link.item_id}:${link.card_key}`, entry = cards.get(`${link.item_id}:${link.card_key}`);
      // When a card has a scheduled activity, only its actual completion records count.
      const scheduled = [...tasks.values(),...habits.values()].some(activity => Number(activity.source_item_id) === Number(link.item_id) && activity.source_card_key === link.card_key);
      if (!entry || groups.has(key) || scheduled || range?.category) continue;
      groups.set(key,{key,entry,dates:new Set(inRange(link.completed_on) ? [link.completed_on] : [])});
    }
    const activities = [...groups.values()].map(item => ({...item, dates:[...item.dates].sort().reverse(), count:item.dates.size}));
    const completed = activities.filter(item => item.count > 0).length, contributions = activities.reduce((sum,item) => sum+item.count,0);
    return {...goal, activities, total:activities.length, completed, contributions, percent:activities.length ? Math.round(100*completed/activities.length) : 0};
  });
}

function goalContributionsLabel(count) { return t(count === 1 ? 'goals_contribution_one' : 'goals_contributions_count',{count}); }
function goalAchievedLabel(count) { return t(count === 1 ? 'goals_achieved_one' : 'goals_achieved_count',{count}); }

function goalActivityList(activities, completedOnly = false) {
  const shown = activities.filter(activity => !completedOnly || activity.count).sort((a,b) => b.count-a.count || a.entry.name.localeCompare(b.entry.name));
  if (!shown.length) return `<p class="muted">${t(completedOnly ? 'goals_no_contributions' : 'goals_no_tasks')}</p>`;
  return `<ul class="goal-activity-list">${shown.map(activity => `<li>${icon(activity.count ? 'check' : 'clock')}<div><strong>${esc(activity.entry.name)}</strong><span>${t(activity.entry.kind === 'card' ? 'goals_board_card' : 'planner_'+activity.entry.kind)} · ${goalContributionsLabel(activity.count)}</span>${activity.dates.length ? `<details><summary>${t('goals_completion_dates')}</summary><p>${activity.dates.map(date => esc(fmt(date,{dateStyle:'medium'}))).join(' · ')}</p></details>` : ''}</div></li>`).join('')}</ul>`;
}

function goalCard(goal, progress = false) {
  return `<article class="card goal-card">
    <div class="goal-card-heading"><div><span class="goal-status ${goal.status === 'completed' ? 'is-complete' : ''}">${t(goal.status === 'completed' ? 'goals_achieved' : 'goals_active')}</span><h3>${esc(goal.name)}</h3></div>${!progress ? `<button class="icon-btn" data-action="goal-edit" data-id="${goal.id}" aria-label="${esc(t('edit')+': '+goal.name)}">${icon('edit')}</button>` : ''}</div>
    ${!progress && goal.description ? `<p class="preserve-lines">${esc(goal.description)}</p>` : ''}
    ${!progress && goal.target_date ? `<p class="goal-target">${icon('calendar')}${t('goals_target')}: ${esc(fmt(goal.target_date,{dateStyle:'medium'}))}</p>` : ''}
    <div class="goal-counts"><strong>${goal.completed}<span> / ${goal.total}</span></strong><span>${t('goals_tasks_contributed')}</span><b>${goalContributionsLabel(goal.contributions)}</b></div>
    <div class="goal-track" role="meter" aria-label="${esc(t('goals_tasks_contributed'))}" aria-valuemin="0" aria-valuemax="${goal.total || 1}" aria-valuenow="${goal.completed}"><i style="width:${goal.percent}%"></i></div>
    <details class="goal-activities" ${progress ? 'open' : ''}><summary>${t(progress ? 'goals_completed_tasks' : 'goals_linked_tasks')}</summary>${goalActivityList(goal.activities,progress)}</details>
  </article>`;
}

function goalsProgressSection(range) {
  const goals = goalsReport(range);
  return `<section class="goals-progress" aria-labelledby="goals-progress-heading"><div class="goals-section-heading"><div><h2 id="goals-progress-heading">${t('goals_progress_heading')}</h2><p>${t('goals_progress_hint')}</p></div><button class="btn secondary" data-view="goals">${t('goals_manage')}</button></div>
    <div class="goal-summary"><strong>${goals.length}</strong><span>${t('goals_total')}</span><span>${goalAchievedLabel(goals.filter(goal => goal.status === 'completed').length)}</span></div>
    <div class="goals-grid">${goals.map(goal => goalCard(goal,true)).join('') || `<p class="muted">${t('goals_empty_hint')}</p>`}</div></section>`;
}

function goalsPage() {
  const goals = goalsReport();
  return `${heading(t('goals'),t('goals_intro'),button('goals_new','goal-new','primary'))}
    <div class="goal-summary"><strong>${goals.length}</strong><span>${t('goals_total')}</span><span>${goalAchievedLabel(goals.filter(goal => goal.status === 'completed').length)}</span></div>
    <p class="goals-method">${t('goals_method')}</p>
    <div class="goals-grid">${goals.map(goal => goalCard(goal)).join('') || `<div class="card goal-empty">${icon('goals')}<h2>${t('goals_empty')}</h2><p>${t('goals_empty_hint')}</p>${button('goals_new','goal-new','primary')}</div>`}</div>`;
}

function goalForm(goal = null) {
  openModal(goal ? 'goals_edit' : 'goals_new',`<form data-form="saveGoal">${goal ? `<input type="hidden" name="id" value="${goal.id}">` : ''}${field('name','goals_name','text',goal?.name || '',{required:true,maxlength:190})}${textarea('description','description',goal?.description || '')}<div class="form-grid">${field('target_date','goals_target','date',goal?.target_date || '')}${selectField('status','status',[['active',t('goals_active')],['completed',t('goals_achieved')]],goal?.status || 'active')}</div><p class="field-help">${t('goals_status_hint')}</p>${formFooter('save',goal ? `<button type="button" class="text-btn danger" data-action="goal-delete" data-id="${goal.id}">${icon('trash')}${t('delete')}</button>` : '')}</form>`);
}

class GoalsPage extends PageController {
  constructor() {
    super(['goal-new','goal-edit','goal-delete','goal-quick-create']);
    document.addEventListener('keydown',event => {
      if (event.key !== 'Enter' || !event.target.matches?.('[data-goal-name]')) return;
      event.preventDefault();
      event.target.closest('[data-goal-picker]').querySelector('[data-action="goal-quick-create"]').click();
    });
  }
  async handleAction(action,el,id) {
    if (action === 'goal-new') return goalForm();
    const goal = S.data.goals?.items.find(goal => Number(goal.id) === id);
    if (action === 'goal-edit' && goal) return goalForm(goal);
    if (action === 'goal-delete' && goal) return confirmAction('goals_delete_confirm',() => mutate('deleteGoal',{id}));
    if (action === 'goal-quick-create') {
      const picker = el.closest('[data-goal-picker]'), input = $('[data-goal-name]',picker), error = $('[data-goal-error]',picker);
      error.textContent = '';
      if (!input.value.trim()) { error.textContent = t('error_validation'); input.focus(); return; }
      const submit = el.closest('form')?.querySelector('[type=submit]');
      el.disabled = true; if (submit) submit.disabled = true;
      try {
        const result = await api('saveGoal',{name:input.value.trim(),description:'',status:'active'});
        const goal = {...result,name:input.value.trim(),description:'',status:'active',target_date:null};
        S.data.goals ||= {items:[],links:[]}; S.data.goals.items.unshift(goal);
        const options = $('.goal-picker-options',picker); $('.muted',options)?.remove();
        options.insertAdjacentHTML('beforeend',`<label><input type="checkbox" name="goal_ids" value="${goal.id}" checked><span>${esc(goal.name)}</span></label>`);
        input.value = ''; $('.goal-quick-create',picker).open = false;
        options.lastElementChild.querySelector('input').focus(); toast(t('saved'));
      } catch (failure) { error.textContent = failure.message; }
      finally { el.disabled = false; if (submit) submit.disabled = false; }
    }
  }
}
