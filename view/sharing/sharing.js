function sharingPage() {
  const tabs = [
    'with_me',
    'by_me',
    'collaborative',
    'invitations',
    'shared_categories',
    'group_progress',
  ];
  const f = S.shareFilter;
  let content = '';
  if (S.sharingTab === 'by_me' || S.sharingTab === 'shared_categories') {
    let rows = S.data.outgoing;
    if (S.sharingTab === 'shared_categories') rows = rows.filter((r) => r.category_id);
    rows = rows.filter(
      (r) =>
        (!f.category ||
          String(
            r.category_id ||
              S.data.habits.find((h) => Number(h.id) === Number(r.habit_id))?.category_id
          ) === f.category) &&
        (!f.owner || f.owner === String(S.user.id)) &&
        (!f.permission || r.permission === f.permission) &&
        (!f.status || r.status === f.status) &&
        (!f.search ||
          (r.resource_name + ' ' + r.recipient_email)
            .toLowerCase()
            .includes(f.search.toLowerCase()))
    );
    content = rows
      .map(
        (r) =>
          `<article class="card share-card"><div class="share-card-top"><span class="share-symbol">${icon(r.category_id ? 'categories' : 'sharing')}</span>${badge(r.status)}</div><h3>${esc(r.category_key ? t(r.category_key) : r.resource_name)}</h3><p>${esc(r.recipient_email)}</p><div class="share-meta">${badge(r.permission)}<span>${t(r.progress_visibility)}</span></div>${r.category_id ? `<p class="field-help">${t(r.include_future == 1 ? 'future_habits' : 'future_default')}</p>` : ''}${['pending', 'accepted'].includes(r.status) ? `<div class="share-card-actions"><button class="btn secondary" data-action="manage-share" data-id="${r.id}">${t('manage_permissions')}</button><button class="text-btn danger" data-action="revoke" data-id="${r.id}">${t('revoke')}</button></div>` : ''}</article>`
      )
      .join('');
    if (S.sharingTab === 'shared_categories') {
      content += S.data.incoming
        .filter((r) => r.category_id && r.status === 'accepted')
        .map(invitationCard)
        .join('');
    }
  } else if (S.sharingTab === 'invitations') {
    content = S.data.incoming
      .filter(
        (r) =>
          (!f.status || r.status === f.status) &&
          (!f.permission || r.permission === f.permission) &&
          (!f.owner || String(r.owner_user_id) === f.owner) &&
          (!f.category ||
            String(
              r.category_id ||
                S.data.habits.find((h) => Number(h.id) === Number(r.habit_id))?.category_id
            ) === f.category) &&
          (!f.search ||
            (r.owner_name + ' ' + r.resource_name).toLowerCase().includes(f.search.toLowerCase()))
      )
      .map(invitationCard)
      .join('');
  } else {
    let rows = S.data.habits.filter((h) => h.permission !== 'owner');
    if (S.sharingTab === 'collaborative' || S.sharingTab === 'group_progress') {
      const acceptedIds = new Set(
        S.data.outgoing
          .filter((r) => r.status === 'accepted')
          .flatMap((r) =>
            r.habit_id
              ? [Number(r.habit_id)]
              : S.data.habits
                  .filter(
                    (h) =>
                      Number(h.category_id) === Number(r.category_id) && h.permission === 'owner'
                  )
                  .map((h) => Number(h.id))
          )
      );
      rows = S.data.habits.filter(
        (h) =>
          (h.permission !== 'owner' && h.permission !== 'viewer') || acceptedIds.has(Number(h.id))
      );
    }
    rows = rows.filter(
      (h) =>
        (!f.permission || h.permission === f.permission) &&
        (!f.category || String(h.category_id) === f.category) &&
        (!f.owner || String(h.owner_user_id) === f.owner) &&
        (!f.status || h.status === f.status) &&
        (!f.search ||
          (
            h.owner_name +
            ' ' +
            h.name +
            ' ' +
            (h.group?.members || []).map((m) => m.name).join(' ')
          )
            .toLowerCase()
            .includes(f.search.toLowerCase()))
    );
    content = rows
      .map(
        (h) =>
          `<article class="card share-card" style="--category-color:${esc(h.color)}"><div class="share-card-top"><span class="share-symbol" style="background:${esc(h.color)}">${icon(h.icon)}</span>${badge(h.permission)}</div><h3>${esc(h.name)}</h3><p>${esc(habitCategory(h))} · ${esc(h.owner_name)}</p><div class="share-details"><span>${icon('calendar')}${esc(scheduleLabel(h))}</span><span>${icon('sparkles')}${t('goal')}: ${goalLabel(h)}</span></div><div class="share-participants"><span>${t('participants')}: ${esc((h.group?.members || []).map((m) => m.name).join(', '))}</span>${badge('accepted')}<span>${t('group_progress')}: ${h.group?.average === null || h.group?.average === undefined ? '—' : h.group.average + '%'}</span></div><div class="share-card-actions"><button class="btn secondary" data-action="habit-detail" data-id="${h.id}">${t('view_all')}</button><button class="text-btn" data-action="group" data-id="${h.id}">${t('group_progress')}</button></div></article>`
      )
      .join('');
  }
  const owners = [
    ...new Map(
      S.data.habits.map((h) => [h.owner_user_id, [h.owner_user_id, h.owner_name]])
    ).values(),
  ];
  const cats = [
    ...new Map(
      S.data.habits.map((h) => [h.category_id, [h.category_id, habitCategory(h)]])
    ).values(),
  ];
  return renderTemplate('sharing', {
    heading: heading(
      t('sharing'),
      t('sharing_subtitle'),
      `<button class="btn primary" data-action="new-share">${icon('plus')}${t('new_invitation')}</button>`
    ),
    tabs: tabs
      .map(
        (v) =>
          `<button role="tab" aria-selected="${S.sharingTab === v}" data-action="sharing-tab" data-tab="${v}" class="${S.sharingTab === v ? 'active' : ''}">${t(v)}${v === 'invitations' && S.data.incoming.some((r) => r.status === 'pending') ? '<span class="tab-dot"></span>' : ''}</button>`
      )
      .join(''),
    searchIcon: icon('search'),
    searchValue: esc(f.search),
    searchPlaceholder: t('search_people'),
    searchLabel: t('search_people'),
    permissionFilter: selectControl(
      'share-permission',
      ['viewer', 'participant', 'editor'].map((x) => [x, t(x)]),
      f.permission,
      t('all_permissions')
    ),
    categoryFilter: selectControl('share-category-filter', cats, f.category, t('all_categories')),
    ownerFilter: selectControl('share-owner-filter', owners, f.owner, t('all_owners')),
    statusFilter: selectControl(
      'share-status-filter',
      ['active', 'archived', 'pending', 'accepted', 'declined', 'revoked'].map((x) => [x, t(x)]),
      f.status,
      t('all_statuses')
    ),
    cards:
      content ||
      `<div class="card empty-wide">${empty(S.sharingTab === 'invitations' ? 'no_invitations' : 'no_shared', 'no_shared_hint', button('new_invitation', 'new-share', 'secondary'))}</div>`,
  });
}

function invitationCard(r) {
  return `<article class="card share-card"><div class="share-card-top"><span class="share-symbol">${icon('sharing')}</span>${badge(r.status)}</div><span class="eyebrow">${esc(t('invited_by', { name: r.owner_name }))}</span><h3>${esc(r.resource_name ? (r.category_key ? t(r.category_key) : r.resource_name) : t('revoked'))}</h3>${r.invitation_message ? `<p class="invitation-message">${esc(r.invitation_message)}</p>` : ''}<div class="share-meta">${badge(r.permission)}<span>${t(r.progress_visibility)}</span></div>${r.status === 'pending' ? `<p class="field-help">${t(r.permission + '_help')}</p><div class="share-card-actions"><button class="btn primary" data-action="accept" data-id="${r.id}">${t('accept')}</button><button class="btn secondary" data-action="decline" data-id="${r.id}">${t('decline')}</button></div>` : r.status === 'accepted' ? `<button class="text-btn danger" data-action="leave" data-id="${r.id}">${t('leave')}</button>` : ''}</article>`;
}

function shareForm(habitId = null, categoryId = null) {
  const mine = S.data.habits.filter((h) => h.permission === 'owner' && h.status === 'active');
  openModal(
    'new_invitation',
    `<form data-form="share"><fieldset class="scope-field"><legend>${t('share_scope')}</legend><label><input type="radio" name="scope" value="habits" ${categoryId ? '' : 'checked'}>${t('selected_habits')}</label><label><input type="radio" name="scope" value="category" ${categoryId ? 'checked' : ''}>${t('entire_category')}</label></fieldset><div id="share-habits-fields" ${categoryId ? 'hidden' : ''}><div class="habit-selection">${mine.map((h) => `<label><input type="checkbox" name="habit_ids" value="${h.id}" ${Number(h.id) === Number(habitId) ? 'checked' : ''}><span>${esc(h.name)}<small>${esc(habitCategory(h))}</small></span></label>`).join('') || `<p>${t('no_results')}</p>`}</div></div><div id="share-category-fields" ${categoryId ? '' : 'hidden'}>${selectField(
      'category_id',
      'category',
      S.data.categories.map((c) => [c.id, categoryName(c)]),
      categoryId || S.data.categories[0]?.id
    )}${checkbox('include_future', 'future_habits')}<p class="field-help">${t('future_default')}</p></div>${field('email', 'recipient_email', 'email', '', { required: true, maxlength: 190, autocomplete: 'off' })}<p class="field-help">${t('email_privacy')}</p>${permissionFields()}${textarea('invitation_message', 'message')}${formFooter('send_invitation')}</form>`,
    true
  );
}

function permissionFields(r = {}) {
  return `<div class="form-grid">${selectField(
    'permission',
    'permission',
    ['viewer', 'participant', 'editor'].map((v) => [v, t(v)]),
    r.permission || 'viewer'
  )}${selectField(
    'progress_visibility',
    'progress_visibility',
    ['none', 'summary', 'detailed'].map((v) => [v, t(v)]),
    r.progress_visibility || 'none'
  )}</div><p class="permission-help field-help">${t((r.permission || 'viewer') + '_help')}</p>`;
}

function manageShare(id) {
  const r = S.data.outgoing.find((r) => Number(r.id) === id);
  openModal(
    'manage_permissions',
    `<form data-form="changeShare"><input type="hidden" name="id" value="${id}"><h3>${esc(r.resource_name)}</h3><p>${esc(r.recipient_email)}</p>${permissionFields(r)}${r.category_id ? checkbox('include_future', 'future_habits', Number(r.include_future) === 1) : ''}${formFooter()}</form>`
  );
}

async function groupModal(id) {
  const h = S.data.habits.find((h) => Number(h.id) === id);
  const r = await api('group', null, { habit_id: id });
  const canConsent = h.permission !== 'owner' && h.permission !== 'viewer';
  openModal(
    'group_progress',
    `<h2>${esc(h.name)}</h2><p class="muted">${fmt(r.start)} – ${fmt(r.end)}</p><div class="group-average">${ring(r.average ?? 0, '', true)}<div><h3>${t('group_average')}</h3><p>${r.average === null ? '—' : r.average + '%'}</p></div></div><div class="group-members">${r.members.map((m) => `<div><span class="avatar">${esc(m.name.slice(0, 1))}</span><div><strong>${esc(m.name)}</strong><small>${m.visibility === 'none' ? t('progress_hidden') : `${m.completed} / ${m.expected} · ${m.percent}%`}</small></div>${m.visibility !== 'none' ? `<div class="progress-track"><i style="width:${m.percent}%"></i></div>` : icon('lock')}${m.history?.length ? `<details><summary>${t('detailed')}</summary>${m.history.map((x) => `<p>${fmt(x.completed_on)} · ${Number(x.amount)} / ${Number(x.goal_at_time)}</p>`).join('')}</details>` : ''}</div>`).join('')}</div><p class="field-help">${t('group_note')}</p>${
      canConsent
        ? `<form data-form="consent"><input type="hidden" name="habit_id" value="${id}">${selectField(
            'progress_consent',
            'my_consent',
            ['none', 'summary', 'detailed'].map((v) => [v, t(v)]),
            h.progress_consent
          )}<p class="field-help">${t('consent_hint')}</p>${formFooter()}</form>`
        : ''
    }`,
    true
  );
}

class SharingPage extends PageController {
  constructor() {
    super([
      'new-share',
      'share-habit',
      'share-category',
      'sharing-tab',
      'accept',
      'decline',
      'manage-share',
      'revoke',
      'leave',
      'group',
    ]);
  }

  async handleAction(action, el, id) {
    switch (action) {
      case 'new-share':
        shareForm();
        break;
      case 'share-habit':
        shareForm(id);
        break;
      case 'share-category':
        shareForm(null, id);
        break;
      case 'sharing-tab':
        S.sharingTab = el.dataset.tab;
        S.shareFilter = { permission: '', category: '', owner: '', status: '', search: '' };
        render();
        break;
      case 'accept':
      case 'decline':
        await mutate('respond', { id, status: action === 'accept' ? 'accepted' : 'declined' });
        break;
      case 'manage-share':
        manageShare(id);
        break;
      case 'revoke':
        confirmAction('revoke_confirm', () => mutate('changeShare', { id, status: 'revoked' }));
        break;
      case 'leave':
        confirmAction('leave_confirm', () => mutate('leaveShare', { id }));
        break;
      case 'group':
        await groupModal(id);
        break;
    }
  }
}
