function openCategory(id, routineId = '') {
  const c = S.data.categories.find((c) => Number(c.id) === Number(id));
  if (!c) return;
  S.categoryId = Number(id);
  S.filter = {
    category: String(id),
    routine: String(routineId || ''),
    status: 'active',
    search: '',
  };
  let habits = S.data.habits.filter(
    (h) =>
      h.permission === 'owner' &&
      Number(h.category_id) === Number(id) &&
      (!routineId || Number(h.routine_id) === Number(routineId))
  );
  if (habits.length && !habits.some((h) => h.status === 'active')) S.filter.status = 'archived';
  habits = habits.filter((h) => h.status === S.filter.status);
  if (habits.length && habits.every((h) => h.start_date > S.date))
    S.date = habits.map((h) => h.start_date).sort()[0];
  else if (habits.length && habits.every((h) => h.end_date && h.end_date < S.date))
    S.date = habits
      .map((h) => h.end_date)
      .sort()
      .at(-1);
  S.view = 'categoryWeek';
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function categoryWeekPage() {
  const c = S.data.categories.find((c) => Number(c.id) === Number(S.categoryId));
  if (!c) return habitsPage();
  const all = S.data.habits.filter(
    (h) => h.permission === 'owner' && Number(h.category_id) === Number(c.id)
  );
  const routines = S.data.routines.filter((r) => Number(r.category_id) === Number(c.id));
  const f = S.filter;
  const tasks = (S.data.calendar?.tasks || []).filter(task=>Number(task.category_id) === Number(c.id) && (!f.search || (task.name+' '+task.description).toLocaleLowerCase().includes(f.search.toLocaleLowerCase())));
  const taskList = tasks.length ? `<section class="planner-category-tasks"><h2>${t('planner_category_tasks')}</h2>${tasks.map(task=>`<div><p class="field-help">${esc(fmt(task.start_date,{dateStyle:'medium'}))}</p>${plannerEntry({...task,kind:'task'},task.start_date,true)}</div>`).join('')}</section>` : '';
  if (!all.length) return `<button class="text-btn back-btn" data-view="habits">${icon('chevron','flip')}${t('back_categories')}</button>${heading(esc(categoryName(c)),t('planner_categories_intro'),`<button class="btn primary" data-action="planner-add" data-category="${c.id}">${icon('plus')}${t('planner_add')}</button>`)}${taskList || empty('planner_empty','planner_empty_hint')}`;
  const habits = all.filter(
    (h) =>
      (!f.routine || String(h.routine_id) === f.routine) &&
      (!f.status || h.status === f.status) &&
      (!f.search ||
        (h.name + ' ' + h.description).toLocaleLowerCase().includes(f.search.toLocaleLowerCase()))
  );
  const start = monday(S.date),
    days = [1, 2, 3, 4, 5, ...[6, 7].filter((d) => all.some((h) => h.schedule_days.includes(d)))];
  const colors = ['#F5C8D8', '#F8D8C5', '#CBE8DD', '#D4E5F7', '#B8A4D4', '#F3DDB5', '#D9E8C7'];
  return renderTemplate('category_week', {
    backIcon: icon('chevron', 'flip'),
    backLabel: t('back_categories'),
    heading: heading(
      esc(categoryName(c)),
      t('category_week_intro'),
      `<div class="button-row">${button('new_routine', 'new-routine', 'secondary')}<button class="btn primary" data-action="planner-add" data-category="${c.id}">${icon('plus')}${t('planner_add')}</button></div>`,
      t('weekly_plan')
    ),
    searchIcon: icon('search'),
    searchValue: esc(f.search),
    searchPlaceholder: t('search'),
    searchLabel: t('search'),
    routineFilter: routines.length
      ? selectControl(
          'category-routine',
          routines.map((r) => [r.id, r.name]),
          f.routine,
          t('all_category_habits')
        )
      : '',
    statusFilter: selectControl(
      'habit-status',
      [
        ['active', t('active')],
        ['archived', t('archived')],
      ],
      f.status,
      t('all_statuses')
    ),
    previousLabel: t('previous_week'),
    previousIcon: icon('chevron', 'flip'),
    dateValue: S.date,
    dateLabel: t('select_date'),
    nextLabel: t('next_week'),
    nextIcon: icon('chevron'),
    todayLabel: t('today'),
    startDate: fmt(start),
    endDate: fmt(shift(start, 6)),
    note: t('category_week_note'),
    tasks: taskList,
    templates: S.data.templates.some((x) => Number(x.category_id) === Number(c.id))
      ? `<div class="routine-pills">${button('choose_template', 'templates', 'secondary')}</div>`
      : '',
    board: !habits.length
      ? empty(
          all.length ? 'no_results' : 'empty_category_week',
          all.length ? 'no_results_hint' : 'empty_category_week_hint',
          button('new_habit', 'new-habit', 'secondary')
        )
      : `<div class="routine-board category-week-board" style="--week-columns:${days.length}">${days
          .map((day) => {
            const date = shift(start, day - 1),
              items = habits.filter((h) => scheduled(h, date)),
              w = S.data.weights.find((w) => w.recorded_on === date);
            return `<section class="routine-day" style="--category-color:${colors[day - 1]}"><header><span>${fmt(date, { weekday: 'long' })}</span><strong>${fmt(date, { day: 'numeric', month: 'short' })}</strong><small>${esc(items[0]?.section || '')}</small></header><div class="exercise-list">${
              items.length
                ? items
                    .map((h) => {
                      const isDone = done(h, date);
                      return `<div class="exercise ${isDone ? 'is-done' : ''}"><button class="habit-check" data-action="toggle-habit" data-id="${h.id}" data-date="${date}" aria-label="${esc(h.name)}" aria-pressed="${isDone}" ${date > today() || h.status !== 'active' ? 'disabled' : ''}>${isDone ? icon('check') : ''}</button><button class="exercise-content" data-action="habit-detail" data-id="${h.id}" data-date="${date}"><strong>${esc(h.name)}</strong><span>${h.scheduled_time ? esc(h.scheduled_time.slice(0, 5)) + ' · ' : ''}${esc(h.description) || goalLabel(h)}</span>${routines.length > 1 && h.routine_name ? `<small>${esc(h.routine_name)}</small>` : ''}</button></div>`;
                    })
                    .join('')
                : `<p class="empty-day">${t('no_due')}</p>`
            }</div><footer><strong>${items.filter((h) => done(h, date)).length} / ${items.length} ${t('completed').toLowerCase()}</strong>${c.icon === 'dumbbell' ? `<button class="text-btn" data-action="weight" data-date="${date}" ${date > today() ? 'disabled' : ''}>${t('weight')}: ${w ? Number(w.weight_kg) : '—'}</button>` : ''}</footer></section>`;
          })
          .join('')}</div>`,
  });
}

class CategoryWeekPage extends PageController {
  constructor() {
    super(['filter-category', 'week-prev', 'week-next', 'open-routine']);
  }

  async handleAction(action, el, id) {
    switch (action) {
      case 'filter-category':
        openCategory(id);
        break;
      case 'week-prev':
        S.date = shift(S.date, -7);
        render();
        break;
      case 'week-next':
        S.date = shift(S.date, 7);
        render();
        break;
      case 'open-routine': {
        const r = S.data.routines.find((r) => Number(r.id) === id);
        if (r) openCategory(r.category_id, id);
        break;
      }
    }
  }
}
