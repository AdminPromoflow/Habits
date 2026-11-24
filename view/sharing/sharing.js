function sharingEntries(tab = S.sharingTab) {
  const entries = [];
  for (const [type, catalog] of [['habit', S.data], ['mindspace', S.data.mindspace_shares || {}]]) {
    for (const direction of ['incoming', 'outgoing']) {
      for (const row of catalog[direction] || []) {
        if (tab !== 'invitations' && row.status !== 'accepted' && !(direction === 'outgoing' && row.status === 'pending')) continue;
        if (tab === 'with_me' && direction !== 'incoming') continue;
        if (tab === 'by_me' && direction !== 'outgoing') continue;
        const mine = direction === 'outgoing';
        const email = mine ? row.recipient_email : row.owner_email;
        const key = email?.toLowerCase() || `user:${row.owner_user_id}`;
        const name = (mine ? row.recipient_name : row.owner_name) || email || t('participants');
        entries.push({type, row, mine, key, name, email:email || ''});
      }
    }
  }
  return entries;
}

function sharingPeople(entries) {
  const people = new Map();
  for (const entry of entries) {
    const person = people.get(entry.key) || {key:entry.key, name:entry.name, email:entry.email, entries:[]};
    if (entry.name !== entry.email) person.name = entry.name;
    person.entries.push(entry); people.set(entry.key, person);
  }
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function sharingSidebarOpen() {
  if (S.sharingSidebarExpanded === undefined) {
    try { S.sharingSidebarExpanded = localStorage.getItem(`mrm-sharing-sidebar:${S.user.id}`) === 'open'; }
    catch { S.sharingSidebarExpanded = false; }
  }
  return S.sharingSidebarExpanded;
}
function setSharingSidebarOpen(open) {
  S.sharingSidebarExpanded = open;
  try { localStorage.setItem(`mrm-sharing-sidebar:${S.user.id}`, open ? 'open' : 'closed'); } catch {}
}
function sharingSidebar(pending = 0) {
  const people = sharingPeople(sharingEntries('invitations').filter(entry => ['pending','accepted'].includes(entry.row.status)));
  return `<section class="sharing-sidebar"><button type="button" id="sharing-sidebar-toggle" class="nav-item sharing-sidebar-toggle ${S.view === 'sharing' ? 'active' : ''}" data-action="sharing-sidebar-toggle" aria-expanded="${sharingSidebarOpen()}" aria-controls="sharing-sidebar-people">${icon('sharing')}<span>${esc(t('sharing'))}</span>${pending ? `<span class="nav-count">${pending}</span>` : ''}<span class="sharing-sidebar-chevron" aria-hidden="true">›</span></button>
    <div id="sharing-sidebar-people" ${sharingSidebarOpen() ? '' : 'hidden'}>${people.map(person => {
      const selected = S.view === 'sharing' && S.sharePerson === person.key;
      return `<div class="sharing-sidebar-person"><button type="button" class="sharing-person-link ${selected ? 'is-selected' : ''}" data-action="sharing-sidebar-person" data-person="${esc(person.key)}" aria-pressed="${selected}" title="${esc(person.email)}">${icon('profile')}<span>${esc(person.name)}</span></button>
        ${selected ? `<div class="sharing-sidebar-resources">${person.entries.map(entry => {
          if (entry.type === 'mindspace' && S.sharedWorkspace?.id === entry.row.id) return `<div class="mindspace-explorer sharing-sidebar-workspace">${pageControllers.home.mindspace.explorer()}</div>`;
          return sharingResourceLink(entry, true);
        }).join('')}</div>` : ''}</div>`;
    }).join('') || `<p class="share-no-people muted">${esc(t('sharing_no_people'))}</p>`}</div></section>`;
}
function sharingResourceLink(entry, sidebar = false) {
  const {row, mine, type} = entry;
  const canOpen = mine || row.status === 'accepted';
  const action = !canOpen ? 'sharing-sidebar-person' : type === 'mindspace' ? 'ms-share-preview' : row.habit_id ? 'habit-detail' : 'share-category-view';
  const id = type === 'habit' && row.habit_id ? row.habit_id : row.id;
  const name = row.category_key ? t(row.category_key) : row.resource_name || t('revoked');
  const symbol = type === 'mindspace' ? pageControllers.home.mindspace.kindIcon(row.kind === 'space' ? 'folder' : row.kind) : icon(row.category_id ? 'categories' : 'habits');
  return `<button type="button" class="sharing-resource-link ${sidebar ? 'is-sidebar' : ''}" data-action="${action}" data-id="${id}" data-person="${esc(entry.key)}" data-direction="${mine ? 'outgoing' : 'incoming'}" ${!canOpen ? 'data-invitations="true"' : ''} title="${esc(name)}">${symbol}<span>${esc(name)}${row.status === 'pending' ? `<small>${esc(t('pending'))}</small>` : ''}</span></button>`;
}
function sharingResourceRow(entry) {
  const {row, mine, type} = entry;
  return `<article class="sharing-resource-row">${sharingResourceLink(entry)}<div class="sharing-resource-meta"><span>${esc(t(mine ? 'by_me' : 'with_me'))}</span>${type === 'mindspace' ? `<span>${sharingPermissionsText(row.permissions)}</span>` : ''}</div>
    ${mine ? `<button type="button" class="text-btn" data-action="${type === 'mindspace' ? 'ms-share-manage' : 'manage-share'}" data-id="${row.id}">${esc(t('manage_permissions'))}</button>` : ''}</article>`;
}
async function selectSharingPerson(key, {sidebar = false, invitations = false} = {}) {
  if (!await pageControllers.home.mindspace.flush()) return;
  if (S.sharedWorkspace) leaveSharedWorkspace();
  if (sidebar) S.sharingTab = 'all';
  if (invitations || !sharingEntries().some(entry => entry.key === key)) S.sharingTab = 'invitations';
  S.sharePerson = key; S.view = 'sharing'; S.mode = 'personal';
  S.shareFilter = {permission:'', category:'', owner:'', status:'', search:''};
  setSharingSidebarOpen(true);
  document.body.classList.remove('menu-open');
  const entries = sharingEntries().filter(entry => entry.key === key);
  // A single shared workspace opens directly; several resources remain listed.
  if (S.sharingTab !== 'invitations' && entries.length === 1 && entries[0].type === 'mindspace') return openSharedWorkspace(entries[0].row.id);
  render(); window.scrollTo(0, 0);
}

function sharingHabitCard({row:r, mine}) {
  if (!mine && r.status !== 'accepted') return invitationCard(r);
  const open = r.habit_id
    ? `<button class="btn secondary" data-action="habit-detail" data-id="${r.habit_id}">${esc(t('view_all'))}</button>`
    : `<button class="btn secondary" data-action="share-category-view" data-id="${r.id}" data-direction="${mine ? 'outgoing' : 'incoming'}">${esc(t('view_all'))}</button>`;
  const controls = mine && ['pending','accepted'].includes(r.status)
    ? `<button class="btn secondary" data-action="manage-share" data-id="${r.id}">${esc(t('manage_permissions'))}</button><button class="text-btn danger" data-action="revoke" data-id="${r.id}">${esc(t('revoke'))}</button>`
    : !mine && r.status === 'accepted' ? `<button class="text-btn" data-action="leave" data-id="${r.id}">${esc(t('leave'))}</button>` : '';
  return `<article class="card share-card"><div class="share-card-top"><span class="share-symbol">${icon(r.category_id ? 'categories' : 'habits')}</span>${badge(r.status)}</div>
    <h3>${esc(r.category_key ? t(r.category_key) : r.resource_name || t('revoked'))}</h3><div class="share-meta">${badge(r.permission)}<span>${esc(t(r.progress_visibility))}</span></div>
    ${r.invitation_message ? `<p class="invitation-message">${esc(r.invitation_message)}</p>` : ''}
    <div class="share-card-actions">${mine || r.status === 'accepted' ? open : ''}${controls}</div></article>`;
}

function sharingPage() {
  if (S.sharedWorkspace) return sharedWorkspacePage();
  const tabs = ['all', 'with_me', 'by_me', 'invitations'];
  if (!tabs.includes(S.sharingTab)) S.sharingTab = 'all';
  const search = S.shareFilter.search.toLowerCase();
  const entries = sharingEntries().filter(entry => !search || `${entry.name} ${entry.email} ${entry.row.resource_name || ''}`.toLowerCase().includes(search));
  const people = sharingPeople(entries), selected = people.find(person => person.key === S.sharePerson);
  const pending = [...(S.data.incoming || []), ...(S.data.mindspace_shares?.incoming || [])].some(row => row.status === 'pending');
  return renderTemplate('sharing', {
    heading:heading(t('sharing'), t('sharing_subtitle'), `<button class="btn primary" data-action="new-share">${icon('plus')}${esc(t('new_invitation'))}</button>`),
    tabs:tabs.map(tab => `<button role="tab" aria-selected="${S.sharingTab === tab}" data-action="sharing-tab" data-tab="${tab}" class="${S.sharingTab === tab ? 'active' : ''}">${esc(t(tab))}${tab === 'invitations' && pending ? '<span class="tab-dot"></span>' : ''}</button>`).join(''),
    searchIcon:icon('search'), searchValue:esc(S.shareFilter.search), searchPlaceholder:esc(t('sharing_search')), searchLabel:esc(t('sharing_search')),
    peopleLabel:esc(t('participants')),
    people:people.map(person => `<button type="button" class="share-person ${person === selected ? 'is-selected' : ''}" data-action="sharing-person" data-person="${esc(person.key)}" aria-pressed="${person === selected}">
      <span class="avatar" aria-hidden="true">${esc(person.name.slice(0, 1).toUpperCase())}</span><span class="share-person-label"><strong>${esc(person.name)}</strong>${person.name !== person.email ? `<small>${esc(person.email)}</small>` : ''}<small>${esc(t(S.sharingTab === 'invitations' ? 'sharing_invitation_count' : 'sharing_item_count', {count:person.entries.length}))}</small></span>${icon('chevron')}</button>`).join('') || `<p class="muted share-no-people">${esc(t(search ? 'no_results' : S.sharingTab === 'invitations' ? 'no_invitations' : 'sharing_no_people'))}</p>`,
    detailsHeading:selected ? `<h2>${esc(selected.name)}</h2>${selected.name !== selected.email ? `<p class="muted">${esc(selected.email)}</p>` : ''}` : '',
    cards:selected ? S.sharingTab !== 'invitations' ? `<div class="sharing-resource-list">${selected.entries.map(sharingResourceRow).join('')}</div>` : selected.entries.map(entry => `<div class="share-resource"><span class="share-direction">${esc(t(entry.mine ? 'sharing_sent' : 'sharing_received'))}</span>${entry.type === 'mindspace' ? mindSpaceShareCards(entry.mine ? 'by_me' : 'invitations', [entry.row]) : sharingHabitCard(entry)}</div>`).join('')
      : `<div class="card empty-wide">${empty('sharing_choose_person', people.length ? 'sharing_choose_person_hint' : 'no_shared_hint')}</div>`,
  });
}

function invitationCard(r) {
  return `<article class="card share-card"><div class="share-card-top"><span class="share-symbol">${icon('sharing')}</span>${badge(r.status)}</div><span class="eyebrow">${esc(t('invited_by', { name: r.owner_name }))}</span><h3>${esc(r.resource_name ? (r.category_key ? t(r.category_key) : r.resource_name) : t('revoked'))}</h3>${r.invitation_message ? `<p class="invitation-message">${esc(r.invitation_message)}</p>` : ''}<div class="share-meta">${badge(r.permission)}<span>${t(r.progress_visibility)}</span></div>${r.status === 'pending' ? `<p class="field-help">${t(r.permission + '_help')}</p><div class="share-card-actions"><button class="btn primary" data-action="accept" data-id="${r.id}">${t('accept')}</button><button class="btn secondary" data-action="decline" data-id="${r.id}">${t('decline')}</button></div>` : r.status === 'accepted' ? `<button class="text-btn danger" data-action="leave" data-id="${r.id}">${t('leave')}</button>` : ''}</article>`;
}

function shareForm(habitId = null, categoryId = null) {
  const mine = S.data.habits.filter((h) => h.permission === 'owner' && h.status === 'active');
  openModal(
    'new_invitation',
    `${S.data.mindspace?.spaces?.length ? `<button type="button" class="btn secondary ms-share-picker" data-action="ms-share-picker">${icon('folder')}${esc(t('ms_share_item'))}</button>` : ''}<form data-form="share"><fieldset class="scope-field"><legend>${t('share_scope')}</legend><label><input type="radio" name="scope" value="habits" ${categoryId ? '' : 'checked'}>${t('selected_habits')}</label><label><input type="radio" name="scope" value="category" ${categoryId ? 'checked' : ''}>${t('entire_category')}</label></fieldset><div id="share-habits-fields" ${categoryId ? 'hidden' : ''}><div class="habit-selection">${mine.map((h) => `<label><input type="checkbox" name="habit_ids" value="${h.id}" ${Number(h.id) === Number(habitId) ? 'checked' : ''}><span>${esc(h.name)}<small>${esc(habitCategory(h))}</small></span></label>`).join('') || `<p>${t('no_results')}</p>`}</div></div><div id="share-category-fields" ${categoryId ? '' : 'hidden'}>${selectField(
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

function sharingPermissionsText(permissions = {}) {
  return esc(['edit','move','delete','share'].filter(right => permissions[right]).map(right => t(`ms_permission_${right}`)).join(' · ') || t('ms_share_readonly_short'));
}
function mindSpacePermissionFields(permissions = {edit:true}, maximum = {edit:true,move:true,delete:true,share:true}) {
  return `<fieldset class="ms-share-permissions"><legend>${esc(t('permission'))}</legend>${['edit','move','delete','share'].map(right => `<label><input type="checkbox" name="can_${right}" value="1" ${permissions[right] && maximum[right] ? 'checked' : ''} ${maximum[right] ? '' : 'disabled'}><span>${esc(t(`ms_permission_${right}`))}</span></label>`).join('')}</fieldset><p class="field-help">${esc(t('ms_permissions_hint'))}</p>`;
}
function manageMindSpaceShare(id) {
  const row = S.data.mindspace_shares.outgoing.find(row => row.id === id);
  if (!row) return;
  openModal('manage_permissions', `<form data-form="changeMindSpaceShare"><input type="hidden" name="id" value="${id}"><h3>${esc(row.resource_name)}</h3><p>${esc(row.recipient_email)}</p>${mindSpacePermissionFields(row.permissions, row.allowed_permissions)}${formFooter()}</form>`);
}
function mindSpaceShareForm(target = 'space', id = null) {
  const space = pageControllers.home.mindspace;
  const choices = space.spaces().flatMap(root => [
    ...(!S.sharedWorkspace || root.permissions?.share ? [[`space:${root.id}`, root.name]] : []),
    ...space.items(root.id).map(item => [`item:${item.id}`, `${root.name} / ${[...space.pathTo(item.parent_id, root.id).map(folder => folder.name), item.name].join(' / ')}`]),
  ]);
  openModal('ms_share_item', `<form data-form="shareMindSpace">
    ${selectField('resource', 'ms_share_resource', choices, id ? `${target}:${id}` : choices[0]?.[0])}
    <p class="field-help">${esc(t('ms_share_scope_hint'))}</p>
    ${field('email', 'recipient_email', 'email', '', {required:true, maxlength:190, autocomplete:'off'})}
    <p class="field-help">${esc(t('email_privacy'))}</p>
    ${S.sharedWorkspace ? `<input type="hidden" name="source_share_id" value="${S.sharedWorkspace.delegation_share_id || S.sharedWorkspace.id}">` : ''}
    ${mindSpacePermissionFields({edit:true}, S.sharedWorkspace?.permissions)}
    ${textarea('invitation_message', 'message')}${formFooter('send_invitation')}
  </form>`);
}

function mindSpaceShareCards(tab, selection = null) {
  if (!['by_me','with_me','invitations'].includes(tab)) return '';
  const mine = tab === 'by_me', f = S.shareFilter;
  const rows = selection || S.data.mindspace_shares?.[mine ? 'outgoing' : 'incoming'] || [];
  return rows.filter(row => (tab !== 'with_me' || row.status === 'accepted') && !f.category
    && (!f.permission || f.permission === row.permission) && (!f.status || f.status === row.status)
    && (!f.owner || f.owner === String(row.owner_user_id))
    && (!f.search || `${row.resource_name || ''} ${row.owner_name} ${row.recipient_email}`.toLowerCase().includes(f.search.toLowerCase())))
    .map(row => {
      const actions = mine ? `<button class="btn secondary" data-action="ms-share-preview" data-id="${row.id}">${esc(t('view_all'))}</button>
        ${['pending','accepted'].includes(row.status) ? `<button class="btn secondary" data-action="ms-share-manage" data-id="${row.id}">${esc(t('manage_permissions'))}</button><button class="text-btn danger" data-action="ms-share-revoke" data-id="${row.id}">${esc(t('revoke'))}</button>` : ''}`
        : row.status === 'pending' ? `<button class="btn primary" data-action="ms-share-accept" data-id="${row.id}">${esc(t('accept'))}</button><button class="btn secondary" data-action="ms-share-decline" data-id="${row.id}">${esc(t('decline'))}</button>`
        : row.status === 'accepted' ? `<button class="btn secondary" data-action="ms-share-preview" data-id="${row.id}">${esc(t('view_all'))}</button><button class="text-btn" data-action="ms-share-leave" data-id="${row.id}">${esc(t('leave'))}</button>` : '';
      const kind = row.kind === 'space' ? 'MindSpace' : t(`ms_kind_${row.kind}`);
      return `<article class="card share-card ms-share-card"><div class="share-card-top"><span class="share-symbol">${pageControllers.home.mindspace.kindIcon(row.kind === 'space' ? 'folder' : row.kind)}</span>${badge(row.status)}</div>
        <span class="eyebrow">${esc(kind)}</span><h3>${esc(row.resource_name || t('revoked'))}</h3><p>${esc(mine ? row.recipient_email : t('invited_by', {name:row.owner_name}))}</p>
        <div class="share-meta"><span>${sharingPermissionsText(row.permissions)}</span></div>
        ${row.invitation_message ? `<p class="invitation-message">${esc(row.invitation_message)}</p>` : ''}
        ${actions ? `<div class="share-card-actions">${actions}</div>` : ''}</article>`;
    }).join('');
}

class SharingPage extends PageController {
  constructor() {
    super([
      'new-share',
      'share-habit',
      'share-category',
      'sharing-tab',
      'sharing-person',
      'sharing-sidebar-toggle',
      'sharing-sidebar-person',
      'share-category-view',
      'accept',
      'decline',
      'manage-share',
      'revoke',
      'leave',
      'group',
      'ms-share-picker',
      'ms-share-preview',
      'ms-share-manage',
      'shared-workspace-back',
      'ms-share-accept',
      'ms-share-decline',
      'ms-share-revoke',
      'ms-share-leave',
    ]);
  }

  async handleAction(action, el, id) {
    switch (action) {
      case 'shared-workspace-back':
        if (!await pageControllers.home.mindspace.flush()) return;
        leaveSharedWorkspace(); await refresh();
        break;
      case 'ms-share-manage':
        manageMindSpaceShare(id);
        break;
      case 'sharing-person':
      case 'sharing-sidebar-person':
        await selectSharingPerson(el.dataset.person, {sidebar:action === 'sharing-sidebar-person', invitations:el.dataset.invitations === 'true'});
        break;
      case 'sharing-sidebar-toggle':
        if (S.view !== 'sharing') {
          setSharingSidebarOpen(true);
          await navigate('sharing');
        } else {
          setSharingSidebarOpen(!sharingSidebarOpen());
          document.getElementById('sharing-sidebar-toggle')?.setAttribute('aria-expanded', String(sharingSidebarOpen()));
          const list = document.getElementById('sharing-sidebar-people');
          if (list) list.hidden = !sharingSidebarOpen();
        }
        break;
      case 'share-category-view': {
        const mine = el.dataset.direction === 'outgoing';
        const row = S.data[mine ? 'outgoing' : 'incoming'].find(row => Number(row.id) === id);
        if (!row) return;
        const habits = S.data.habits.filter(habit => Number(habit.category_id) === Number(row.category_id) && Number(habit.owner_user_id) === Number(mine ? S.user.id : row.owner_user_id));
        openModal('shared_categories', `<h3>${esc(row.category_key ? t(row.category_key) : row.resource_name)}</h3><div class="ms-shared-files">${habits.map(habit => `<button class="btn secondary" data-action="habit-detail" data-id="${habit.id}">${esc(habit.name)}</button>`).join('') || `<p>${esc(t('no_results'))}</p>`}</div>`);
        break;
      }
      case 'ms-share-picker':
        mindSpaceShareForm();
        break;
      case 'ms-share-preview':
        await openSharedWorkspace(id);
        break;
      case 'ms-share-accept':
      case 'ms-share-decline':
        await mutate('respondMindSpaceShare', {id, status:action === 'ms-share-accept' ? 'accepted' : 'declined'});
        break;
      case 'ms-share-revoke':
        confirmAction('revoke_confirm', () => mutate('revokeMindSpaceShare', {id}));
        break;
      case 'ms-share-leave':
        confirmAction('leave_confirm', () => mutate('leaveMindSpaceShare', {id}));
        break;
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
        S.sharePerson = null;
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
