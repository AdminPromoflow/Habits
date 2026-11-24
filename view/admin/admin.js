function adminPage() {
  if (!S.admin) return empty('loading');
  const a = S.admin;
  if (S.view === 'profile') return profilePage();
  const titles = {
    overview: 'admin_subtitle',
    users: 'admin_subtitle',
    categories: 'private_category_hint',
    requests: 'admin_subtitle',
    templates: 'template_hint',
    statistics: 'admin_privacy',
    settings: 'admin_subtitle',
  };
  let body = '',
    action = '';
  if (S.view === 'overview' || S.view === 'statistics') {
    body = `<p class="info-line">${icon('shield')}${t('admin_privacy')}</p><div class="admin-stats">${[
      ['users', 'platform_users', 'sharing'],
      ['habits', 'platform_habits', 'habits'],
      ['completions', 'platform_completions', 'check'],
      ['collaborations', 'platform_collaborations', 'flower'],
    ]
      .map(
        ([key, label, ico]) =>
          `<article class="card metric">${icon(ico)}<strong>${a.statistics[key]}</strong><span>${t(label)}</span></article>`
      )
      .join(
        ''
      )}</div><section class="card"><div class="section-heading"><h2>${t('pending_requests')}</h2><button class="text-btn" data-view="requests">${t('view_all')}</button></div>${requestTable(a.requests.filter((r) => r.status === 'pending'))}</section><section class="card new-users-card"><h2>${t('new_users')}</h2><div class="registration-chart">${a.statistics.weekly.length ? a.statistics.weekly.map((r) => `<div class="registration-row"><span>${fmt(r.date)}</span><div class="progress-track"><i style="width:${(Number(r.total) / Math.max(...a.statistics.weekly.map((x) => Number(x.total)))) * 100}%"></i></div><strong>${r.total}</strong></div>`).join('') : empty('no_results')}</div></section>`;
  } else if (S.view === 'users') {
    body = `<div class="filter-bar"><label class="search-field">${icon('search')}<input id="user-search" value="${esc(S.userSearch || '')}" placeholder="${t('search_users')}" aria-label="${t('search_users')}"></label></div><div class="card table-wrap"><table><thead><tr>${['name', 'email', 'role', 'status', 'registered', 'edit'].map((x) => `<th>${t(x)}</th>`).join('')}</tr></thead><tbody>${a.users
      .filter((u) =>
        (u.name + ' ' + u.email).toLowerCase().includes((S.userSearch || '').toLowerCase())
      )
      .map(
        (u) =>
          `<tr><td><strong>${esc(u.name)}</strong></td><td>${esc(u.email)}</td><td>${u.roles
            .split(',')
            .map((r) => badge(r))
            .join(
              ' '
            )}</td><td>${badge(u.status)}</td><td>${fmt(u.created_at.slice(0, 10))}</td><td><button class="icon-btn" data-action="manage-user" data-id="${u.id}" aria-label="${t('manage_user')}">${icon('edit')}</button></td></tr>`
      )
      .join('')}</tbody></table></div>`;
  } else if (S.view === 'categories') {
    action = button('new_category', 'new-global-category');
    body = `<div class="category-grid">${a.categories.map((c) => `<article class="category-card" style="--category-color:${esc(c.color)}"><span class="category-icon">${icon(c.icon)}</span><h3>${esc(categoryName(c))}</h3><p>${esc(c.description)}</p><div class="category-card-bottom">${badge('global')}<button class="icon-btn" data-action="edit-global-category" data-id="${c.id}" aria-label="${t('edit')}">${icon('edit')}</button></div></article>`).join('')}</div>`;
  } else if (S.view === 'requests') {
    body = `<section class="card">${requestTable(a.requests)}</section>`;
  } else if (S.view === 'templates') {
    action = button('new_template', 'new-template');
    body = `<div class="share-grid">${a.templates.map((x) => `<article class="card"><h3>${esc(x.translation_key ? t(x.translation_key) : x.name)}</h3><p>${esc(x.description)}</p><p>${goalLabel(x)}</p>${badge(Number(x.active) ? 'active' : 'archived')}<button class="text-btn" data-action="edit-template" data-id="${x.id}">${t('edit')}</button></article>`).join('')}</div>`;
  } else if (S.view === 'settings') {
    body = `<section class="card settings-panel"><form data-form="platform">${field('platform_name', 'platform_name', 'text', a.settings.platform_name, { required: true, maxlength: 60 })}${checkbox('registration_enabled', 'registration_enabled', a.settings.registration_enabled === '1')}<div class="form-error" role="alert"></div><button class="btn primary" type="submit">${t('save')}</button></form></section>`;
  }
  return renderTemplate('admin', {
    heading: heading(t(S.view), t(titles[S.view] || 'admin_subtitle'), action),
    content: body,
  });
}

function requestTable(rows) {
  return rows.length
    ? rows
        .map(
          (r) =>
            `<div class="request-row"><div><span class="eyebrow">${esc(r.requester)}</span><h3>${esc(r.name)}</h3><p>${esc(r.reason)}</p>${r.feedback ? `<p>${esc(r.feedback)}</p>` : ''}</div><div class="button-row">${badge(r.status)}${r.status === 'pending' ? `<button class="btn secondary" data-action="review-category" data-id="${r.id}">${t('review')}</button>` : ''}</div></div>`
        )
        .join('')
    : empty('no_requests');
}

function templateForm(x = null) {
  openModal(
    x ? 'edit' : 'new_template',
    `<form data-form="saveTemplate">${x ? `<input type="hidden" name="id" value="${x.id}">` : ''}${field('name', 'name', 'text', x?.translation_key ? t(x.translation_key) : x?.name || '', { required: true, maxlength: 190 })}${textarea('description', 'description', x?.description || '')}${selectField(
      'category_id',
      'category',
      S.admin.categories.map((c) => [c.id, categoryName(c)]),
      x?.category_id
    )}<div class="form-grid">${field('goal', 'goal', 'number', x?.goal || 1, { required: true, min: 0.01, step: 0.01, max: 999999 })}${field('unit', 'unit', 'text', x?.unit || '', { maxlength: 40 })}</div>${daysField(x ? JSON.parse(x.schedule_days) : undefined)}${checkbox('active', 'active', !x || Number(x.active) === 1)}${formFooter()}</form>`
  );
}

class AdminPage extends PageController {
  constructor() {
    super([
      'new-global-category',
      'edit-global-category',
      'review-category',
      'manage-user',
      'new-template',
      'edit-template',
    ]);
  }

  async handleAction(action, el, id) {
    switch (action) {
      case 'new-global-category':
        categoryForm(null, true);
        break;
      case 'edit-global-category':
        categoryForm(
          S.admin.categories.find((c) => Number(c.id) === id),
          true
        );
        break;
      case 'review-category': {
        const r = S.admin.requests.find((r) => Number(r.id) === id);
        openModal(
          'review',
          `<h3>${esc(r.name)}</h3><p>${esc(r.description)}</p><p>${esc(r.reason)}</p><form data-form="reviewCategory"><input type="hidden" name="id" value="${id}">${selectField(
            'status',
            'status',
            [
              ['approved', t('approve')],
              ['rejected', t('reject')],
            ],
            'approved'
          )}${textarea('feedback', 'feedback')}${formFooter()}</form>`
        );
        break;
      }
      case 'manage-user': {
        const u = S.admin.users.find((u) => Number(u.id) === id);
        openModal(
          'manage_user',
          `<h3>${esc(u.name)}</h3><p>${esc(u.email)}</p><form data-form="manageUser"><input type="hidden" name="id" value="${id}">${selectField(
            'status',
            'status',
            [
              ['active', t('active')],
              ['suspended', t('suspended')],
            ],
            u.status
          )}${checkbox('admin', 'admin_role', u.roles.includes('admin'))}${formFooter()}</form>`
        );
        break;
      }
      case 'new-template':
        templateForm();
        break;
      case 'edit-template':
        templateForm(S.admin.templates.find((x) => Number(x.id) === id));
        break;
    }
  }
}
