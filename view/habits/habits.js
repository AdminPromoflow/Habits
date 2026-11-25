function habitsPage() {
  const groups = S.data.categories
    .map((c) => ({
      category: c,
      habits: S.data.habits.filter(
        (h) => h.permission === 'owner' && Number(h.category_id) === Number(c.id)
      ),
    }))
    .filter((g) => g.habits.length);
  return renderTemplate('habits', {
    heading: heading(
      t('habits'),
      t('habit_categories_intro'),
      `<div class="button-row">${button('choose_categories', 'manage-categories', 'secondary')}<button class="btn primary" data-action="new-habit">${icon('plus')}${t('new_habit')}</button></div>`
    ),
    categories: groups.length
      ? `<div class="category-grid habit-category-grid">${groups.map(({ category: c, habits }) => `<button class="category-card habit-category-tile" style="--category-color:${esc(c.color)}" data-action="filter-category" data-id="${c.id}"><span class="category-icon">${icon(c.icon)}</span><h2>${esc(categoryName(c))}</h2><p>${t('habits_count', { count: habits.length })}</p><span class="category-week-link">${t('open_weekly_plan')}${icon('chevron')}</span></button>`).join('')}</div><p class="field-help">${t('category_first_habit')}</p>`
      : empty(
          'no_category_habits',
          'category_first_habit',
          button('choose_categories', 'manage-categories', 'secondary')
        ),
  });
}

function habitForm(h = null, template = false) {
  if (!h && !S.data.categories.length) {
    chooseCategoryFirst();
    return;
  }
  const own = !h || h.permission === 'owner' || template;
  const options = S.data.categories.map((c) => [c.id, categoryName(c)]);
  const name = template && h?.translation_key ? t(h.translation_key) : h?.name || '';
  const routine = ['routine', 'categoryWeek'].includes(S.view)
    ? S.data.routines.find((r) => Number(r.id) === Number(S.filter.routine || S.routineId))
    : null;
  openModal(
    h && !template ? 'edit' : 'new_habit',
    `<form data-form="saveHabit">${h && !template ? `<input type="hidden" name="id" value="${h.id}">` : ''}${field('name', 'habit_name', 'text', name, { required: true, maxlength: 190 })}${textarea('description', 'description', h?.description || '')}<div class="form-grid">${selectField('category_id', 'category', options, h?.category_id || routine?.category_id || S.filter.category || options[0]?.[0])}${selectField(
      'routine_id',
      'routine',
      S.data.routines
        .filter(
          (r) =>
            Number(r.category_id) ===
            Number(h?.category_id || routine?.category_id || S.filter.category || options[0]?.[0])
        )
        .map((r) => [r.id, r.name]),
      h?.routine_id || routine?.id || '',
      t('no_routine')
    )}</div><div class="form-grid">${field('goal', 'goal', 'number', h?.goal || 1, { required: true, min: 0.01, max: 999999, step: 0.01 })}${field('unit', 'unit', 'text', h?.unit || '', { maxlength: 40 })}</div>${plannerScheduleFields({...h, start_date: h?.start_date || routine?.start_date || today(), end_date: h?.end_date || routine?.end_date || '', recurrence: h?.recurrence || 'weekly'})}${field('section', 'section', 'text', h?.section || '', { maxlength: 150 })}<p class="info-line">${icon('lock')}${t('private_promise')}</p>${formFooter(h && !template ? 'save' : 'create')}</form>`,
    true
  );
  bindPlannerSchedule($('#modal form'));
  if (!own) {
    $('[name=category_id]', $('#modal')).disabled = true;
    $('[name=routine_id]', $('#modal')).disabled = true;
  }
}

async function habitDetail(id) {
  const h = S.data.habits.find((h) => Number(h.id) === id);
  if (!h) return;
  const c = completion(h, S.date),
    can =
      h.permission !== 'viewer' &&
      scheduled(h, S.date) &&
      S.date <= today() &&
      h.status === 'active';
  const history = S.data.completions
    .filter((c) => Number(c.habit_id) === id)
    .slice(-20)
    .reverse();
  openModal(
    'habits',
    `<div class="detail-heading"><span class="category-icon" style="background:${esc(h.color)}">${icon(h.icon)}</span><div><h2>${esc(h.name)}</h2><p>${esc(habitCategory(h))} · ${esc(h.owner_name)}</p></div>${badge(h.permission === 'owner' ? 'private' : h.permission)}</div><p class="preserve-lines">${esc(h.description)}</p><div class="detail-facts"><span>${icon('calendar')}${esc(scheduleLabel(h))}</span><span>${icon('clock')}${h.scheduled_time?.slice(0, 5) || '—'}</span><span>${t('goal')}: ${goalLabel(h)}</span></div><div class="detail-actions">${['owner', 'editor'].includes(h.permission) ? `<button class="btn secondary" data-action="edit-habit" data-id="${h.id}">${icon('edit')}${t('edit')}</button>` : ''}${h.permission === 'owner' ? `<button class="btn secondary" data-action="share-habit" data-id="${h.id}">${icon('sharing')}${t('share_habit')}</button><button class="text-btn" data-action="archive-habit" data-id="${h.id}">${t(h.status === 'archived' ? 'restore' : 'archive')}</button>` : ''}<button class="text-btn" data-action="group" data-id="${h.id}">${t('group_progress')}</button></div>${can ? `<form class="progress-form" data-form="complete"><h3>${t('record_progress')} · ${fmt(S.date)}</h3><input type="hidden" name="habit_id" value="${h.id}"><input type="hidden" name="date" value="${S.date}">${field('amount', 'amount', 'number', c?.amount || h.goal, { required: true, min: 0, max: 999999, step: 0.01 })}${textarea('note', 'note', c?.note || '')}<p class="field-help">${t('notes_private')}</p>${formFooter()}</form>` : ''}<h3>${t('my_history')}</h3>${history.length ? `<div class="history-list">${history.map((c) => `<div><span>${fmt(c.completed_on, { year: 'numeric', month: 'short', day: 'numeric' })}</span><strong>${Number(c.amount)} / ${Number(c.goal_at_time)}</strong>${c.note ? `<p>${esc(c.note)}</p>` : ''}</div>`).join('')}</div>` : `<p class="muted">${t('no_history')}</p>`}`,
    true
  );
}

class HabitsPage extends PageController {
  constructor() {
    super([
      'new-habit',
      'routine-new-habit',
      'edit-habit',
      'habit-detail',
      'toggle-habit',
      'archive-habit',
      'templates',
      'use-template',
    ]);
  }

  async handleAction(action, el, id) {
    switch (action) {
      case 'new-habit':
      case 'routine-new-habit':
        habitForm();
        break;
      case 'edit-habit':
        habitForm(S.data.habits.find((h) => Number(h.id) === id));
        break;
      case 'habit-detail':
        if (el.dataset.date) S.date = el.dataset.date;
        await habitDetail(id);
        break;
      case 'toggle-habit': {
        if (S.busy) return;
        S.busy = true;
        el.disabled = true;
        try {
          const h = S.data.habits.find((h) => Number(h.id) === id),
            date = el.dataset.date || S.date;
          const completed = done(h, date);
          const old = completion(h, date);
          await this.makeRequest('complete', {
            habit_id: id,
            date,
            amount: completed ? 0 : Number(old?.goal_at_time || h.goal),
            note: old?.note || '',
          });
          await refresh();
          toast(t(completed ? 'undo_toast' : 'completed_toast'));
        } finally {
          S.busy = false;
          el.disabled = false;
        }
        break;
      }
      case 'archive-habit': {
        const h = S.data.habits.find((h) => Number(h.id) === id);
        if (h.status === 'active')
          confirmAction('archive_confirm', () =>
            mutate('archiveHabit', { id, status: 'archived' })
          );
        else await mutate('archiveHabit', { id, status: 'active' });
        break;
      }
      case 'templates':
        openModal(
          'choose_template',
          `<p class="muted">${t('template_hint')}</p><div class="template-list">${S.data.templates
            .filter(
              (x) => S.view !== 'categoryWeek' || Number(x.category_id) === Number(S.categoryId)
            )
            .map(
              (x) =>
                `<article><div><h3>${esc(x.translation_key ? t(x.translation_key) : x.name)}</h3><p>${goalLabel(x)}</p></div><button class="btn secondary" data-action="use-template" data-id="${x.id}">${t('use_template')}</button></article>`
            )
            .join('')}</div>`,
          true
        );
        break;
      case 'use-template':
        habitForm(
          S.data.templates.find((x) => Number(x.id) === id),
          true
        );
        break;
    }
  }
}
