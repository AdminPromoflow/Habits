function progressPage() {
  const start = shift(today(), 1 - S.period),
    s = stats(start, today());
  const seven = Array.from({ length: 7 }, (_, i) => {
    const d = shift(today(), i - 6);
    return { d, ...stats(d, d) };
  });
  return renderTemplate('progress', {
    heading: heading(
      t('progress'),
      t('progress_subtitle'),
      `<div class="segmented">${[7, 30].map((n) => `<button data-action="period" data-period="${n}" class="${S.period === n ? 'selected' : ''}">${t('last_' + n)}</button>`).join('')}</div>`
    ),
    checkIcon: icon('check'),
    completions: s.completed,
    completionsLabel: t('total_completions'),
    progressIcon: icon('progress'),
    percent: s.percent,
    percentLabel: t('completion_rate'),
    streakIcon: icon('fire'),
    streak: streak(),
    streakLabel: t('streak'),
    consistencyLabel: t('consistency'),
    privacyBadge: badge('private'),
    bars: seven
      .map(
        (x) =>
          `<div class="bar-column"><span>${x.percent}%</span><div class="bar-track"><i style="height:${x.percent}%"></i></div><small>${fmt(x.d, { weekday: 'short' })}</small></div>`
      )
      .join(''),
    categoryLabel: t('by_category'),
    categories:
      S.data.categories
        .map((c) => {
          const hs = S.data.habits.filter((h) => Number(h.category_id) === Number(c.id));
          const x = stats(start, today(), hs);
          return x.total
            ? `<div><span>${icon(c.icon)}${esc(categoryName(c))}<strong>${x.percent}%</strong></span><div class="progress-track"><i style="width:${x.percent}%;background:${esc(c.color)}"></i></div></div>`
            : '';
        })
        .join('') || empty('no_progress'),
    activityLabel: t('activity'),
    startDate: fmt(shift(today(), -83)),
    endDate: fmt(today()),
    heatmap: Array.from({ length: 84 }, (_, i) => {
      const d = shift(today(), i - 83),
        x = stats(d, d);
      return `<button class="heat-cell level-${x.percent === 0 ? 0 : x.percent < 34 ? 1 : x.percent < 67 ? 2 : x.percent < 100 ? 3 : 4}" data-action="calendar-date" data-date="${d}" title="${fmt(d)}: ${x.completed}/${x.total}" aria-label="${fmt(d)}: ${x.completed}/${x.total}"></button>`;
    }).join(''),
    lessLabel: t('less'),
    legend: [0, 1, 2, 3, 4].map((n) => `<i class="heat-cell level-${n}"></i>`).join(''),
    moreLabel: t('more'),
    explanation: t('progress_explanation'),
  });
}

class ProgressPage extends PageController {
  constructor() {
    super(['period']);
  }

  async handleAction(action, el, id) {
    switch (action) {
      case 'period':
        S.period = Number(el.dataset.period);
        render();
        break;
    }
  }
}
