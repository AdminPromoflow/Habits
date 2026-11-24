function calendarPage() {
  const first = S.month + '-01';
  const start = monday(first);
  const dates = Array.from({ length: 42 }, (_, i) => shift(start, i));
  return renderTemplate('calendar', {
    heading: heading(t('calendar'), t('calendar_subtitle')),
    month: fmt(first, { month: 'long', year: 'numeric' }),
    todayLabel: t('today'),
    previousLabel: t('previous'),
    previousIcon: icon('chevron', 'flip'),
    nextLabel: t('next'),
    nextIcon: icon('chevron'),
    weekdays: [1, 2, 3, 4, 5, 6, 7].map((d) => `<span>${dayLabel(d)}</span>`).join(''),
    cells: dates
      .map((d) => {
        const c = counts(d);
        return `<button class="calendar-cell ${d.slice(0, 7) !== S.month ? 'outside' : ''} ${d === S.date ? 'selected' : ''} ${d === today() ? 'is-today' : ''}" data-action="pick-date" data-date="${d}" aria-label="${fmt(d, { dateStyle: 'full' })}"><span class="calendar-number">${Number(d.slice(-2))}</span>${c.total ? `<span class="calendar-count">${c.done}/${c.total}</span><span class="calendar-track"><i style="width:${(c.done / c.total) * 100}%"></i></span>` : ''}</button>`;
      })
      .join(''),
    detailLabel: t('day_detail'),
    selectedDate: fmt(S.date, { weekday: 'long', month: 'long', day: 'numeric' }),
    habits: due(S.date).length
      ? due(S.date)
          .map((h) => habitRow(h, true))
          .join('')
      : empty('no_due', 'rest_caption'),
  });
}

class CalendarPage extends PageController {
  constructor() {
    super([
      'date-prev',
      'date-next',
      'today',
      'pick-date',
      'calendar-date',
      'month-prev',
      'month-next',
    ]);
  }

  async handleAction(action, el, id) {
    switch (action) {
      case 'date-prev':
        S.date = shift(S.date, -1);
        render();
        break;
      case 'date-next':
        S.date = shift(S.date, 1);
        render();
        break;
      case 'today':
        S.date = today();
        S.month = S.date.slice(0, 7);
        render();
        break;
      case 'pick-date':
        S.date = el.dataset.date;
        render();
        break;
      case 'calendar-date':
        S.date = el.dataset.date;
        S.month = S.date.slice(0, 7);
        S.view = 'calendar';
        render();
        break;
      case 'month-prev':
      case 'month-next': {
        const date = dateObj(S.month + '-01');
        date.setUTCMonth(date.getUTCMonth() + (action === 'month-next' ? 1 : -1));
        S.month = iso(date).slice(0, 7);
        render();
        break;
      }
    }
  }
}
