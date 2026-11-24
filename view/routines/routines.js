function routinePage() {
  const r = S.data.routines.find((r) => Number(r.id) === Number(S.routineId));
  if (!r) return habitsPage();
  const start = monday(S.date),
    habits = S.data.habits.filter(
      (h) =>
        Number(h.routine_id) === Number(r.id) && h.permission === 'owner' && h.status === 'active'
    );
  return renderTemplate('routines', {
    backIcon: icon('chevron', 'flip'),
    backLabel: t('back'),
    heading: heading(
      esc(r.name),
      esc(r.description),
      button('new_habit', 'routine-new-habit', 'primary')
    ),
    dateControls: dateControl(),
    startDate: fmt(r.start_date),
    endDate: r.end_date
      ? fmt(r.end_date, { month: 'long', day: 'numeric', year: 'numeric' })
      : t('no_end'),
    note: t('routine_note'),
    board: Array.from({ length: 5 }, (_, i) => {
      const date = shift(start, i);
      const items = habits.filter((h) => scheduled(h, date));
      const colors = ['#F5C8D8', '#F8D8C5', '#CBE8DD', '#D4E5F7', '#B8A4D4'];
      const w = S.data.weights.find((w) => w.recorded_on === date);
      return `<section class="routine-day" style="--category-color:${colors[i]}"><header><span>${fmt(date, { weekday: 'long' })}</span><strong>${fmt(date, { day: 'numeric', month: 'short' })}</strong><small>${esc(items[0]?.section || '')}</small></header><div class="exercise-list">${
        items.length
          ? items
              .map((h) => {
                const isDone = done(h, date);
                return `<div class="exercise ${isDone ? 'is-done' : ''}"><button class="habit-check" data-action="toggle-habit" data-id="${h.id}" data-date="${date}" aria-label="${esc(h.name)}" aria-pressed="${isDone}" ${date > today() ? 'disabled' : ''}>${isDone ? icon('check') : ''}</button><button class="exercise-content" data-action="habit-detail" data-id="${h.id}" data-date="${date}"><strong>${esc(h.name)}</strong><span>${h.scheduled_time?.slice(0, 5) || ''} <span class="separator">|</span> ${esc(h.description)}</span></button></div>`;
              })
              .join('')
          : `<p class="empty-day">${t('no_due')}</p>`
      }</div><footer><strong>${items.filter((h) => done(h, date)).length} / ${items.length} ${t('completed').toLowerCase()}</strong><button class="text-btn" data-action="weight" data-date="${date}" ${date > today() ? 'disabled' : ''}>${t('weight')}: ${w ? Number(w.weight_kg) : '—'}</button></footer></section>`;
    }).join(''),
  });
}

function routineForm() {
  if (!S.data.categories.length) {
    chooseCategoryFirst();
    return;
  }
  openModal(
    'new_routine',
    `<form data-form="saveRoutine">${field('name', 'name', 'text', '', { required: true, maxlength: 190 })}${selectField(
      'category_id',
      'category',
      S.data.categories.map((c) => [c.id, categoryName(c)]),
      S.filter.category || S.data.categories[0]?.id
    )}${textarea('description', 'description')}<div class="form-grid">${field('start_date', 'start_date', 'date', today(), { required: true })}${field('end_date', 'end_date', 'date')}</div>${formFooter('create')}</form>`
  );
}

class RoutinesPage extends PageController {
  constructor() {
    super(['new-routine', 'weight']);
  }

  async handleAction(action, el, id) {
    switch (action) {
      case 'new-routine':
        routineForm();
        break;
      case 'weight': {
        const date = el.dataset.date;
        const w = S.data.weights.find((w) => w.recorded_on === date);
        openModal(
          'weight',
          `<form data-form="weight"><input type="hidden" name="date" value="${date}"><p>${fmt(date, { dateStyle: 'full' })}</p>${field('weight_kg', 'weight', 'number', w?.weight_kg || '', { required: true, min: 1, max: 500, step: 0.01 })}<p class="field-help">${t('weight_private')}</p>${formFooter('save_weight')}</form>`
        );
        break;
      }
    }
  }
}
