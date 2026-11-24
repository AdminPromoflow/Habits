async function bootstrap() {
  const r = await api('bootstrap');
  if (S.user?.id !== r.user?.id) {
    if (S.user) pageControllers.home.nodeTools.clearClipboard();
    pageControllers.home.reset();
    S.sharedWorkspace = null; S.ownedWorkspace = null; S.sharePerson = null; S.sharingTab = 'all';
    S.sharingSidebarExpanded = undefined;
  }
  Object.assign(S, {
    user: r.user,
    language: r.language,
    dict: r.translations,
    csrf: r.csrf,
    data: r.data,
    registration: r.registration_enabled,
    platformName: r.platform_name,
  });
  if (!S.date) S.date = today();
  if (!S.month) S.month = S.date.slice(0, 7);
  if (S.user && S.mode === 'admin') S.admin = await api('admin');
  const sharedId = Number(new URL(location.href).searchParams.get('shared'));
  if (S.user && sharedId && !S.sharedWorkspace) {
    try { await openSharedWorkspace(sharedId, true); return; }
    catch (error) { toast(error.message, true); }
  }
  render();
}

async function refresh() {
  S.data = await api('data');
  if (S.mode === 'admin') S.admin = await api('admin');
  render();
}

async function mutate(action, data, message = 'saved') {
  await api(action, data);
  await refresh();
  closeModal();
  toast(t(message));
}
class ApplicationActions extends PageController {
  constructor() {
    super([
      'language',
      'logout',
      'switch-mode',
      'menu',
      'close-modal',
      'confirm-action',
      'notifications',
      'read-notifications',
      'retry',
    ]);
  }
  async handleAction(action, el, id) {
    switch (action) {
      case 'language': {
        const lang = el.dataset.lang,
          previous = S.language;
        S.language = lang;
        render();
        try {
          await this.makeRequest('language', { language: lang });
          if (S.user) S.user.language = lang;
        } catch (e) {
          S.language = previous;
          render();
          throw e;
        }
        break;
      }
      case 'logout':
        if ((S.view === 'home' || S.sharedWorkspace) && pageControllers.home.mindspace.enabled() && !await pageControllers.home.mindspace.flush()) return;
        if (S.sharedWorkspace) leaveSharedWorkspace();
        await this.makeRequest('logout', {});
        S.mode = 'personal';
        S.view = 'home';
        S.date = '';
        S.setupToken = null;
        await bootstrap();
        break;
      case 'switch-mode':
        if ((S.view === 'home' || S.sharedWorkspace) && pageControllers.home.mindspace.enabled() && !await pageControllers.home.mindspace.flush()) return;
        if (S.sharedWorkspace) leaveSharedWorkspace();
        S.mode = S.mode === 'admin' ? 'personal' : 'admin';
        S.view = S.mode === 'admin' ? 'overview' : 'home';
        if (S.mode === 'admin') S.admin = await this.makeRequest('admin');
        render();
        break;
      case 'menu':
        document.body.classList.toggle('menu-open');
        break;
      case 'close-modal':
        closeModal();
        break;
      case 'confirm-action': {
        const fn = S.confirmAction;
        S.confirmAction = null;
        if (fn) await fn();
        break;
      }
      case 'notifications':
        openModal(
          'notifications',
          `<div class="notifications-list">${S.data.notifications.length ? S.data.notifications.map((n) => `<article class="${Number(n.is_read) ? '' : 'unread'}">${icon('bell')}<div><strong>${esc(t(n.message_key))}</strong>${n.detail ? `<p>${esc(n.detail)}</p>` : ''}<small>${fmt(n.created_at.slice(0, 10))}</small></div></article>`).join('') : empty('no_notifications')}</div><div class="form-footer">${button('mark_read', 'read-notifications', 'secondary')}</div>`
        );
        break;
      case 'read-notifications':
        await mutate('readNotifications', {});
        break;
      case 'retry':
        await bootstrap();
        break;
    }
  }
}
const pageControllers = {
  home: new HomePage(),
  auth: new AuthPage(),
  habits: new HabitsPage(),
  categories: new CategoriesPage(),
  category_week: new CategoryWeekPage(),
  routines: new RoutinesPage(),
  calendar: new CalendarPage(),
  progress: new ProgressPage(),
  sharing: new SharingPage(),
  profile: new ProfilePage(),
  admin: new AdminPage(),
  application: new ApplicationActions(),
};
document.addEventListener('click', async (event) => {
  const el = event.target.closest('[data-action],[data-view]');
  if (!el || el.disabled) return;
  event.preventDefault();
  try {
    if (el.dataset.view) {
      await navigate(el.dataset.view);
      return;
    }
    const owner = actionControllers.get(el.dataset.action);
    if (owner) await owner.handleAction(el.dataset.action, el, Number(el.dataset.id));
  } catch (error) {
    toast(error.message, true);
  }
});
document.addEventListener('change', (event) => {
  const el = event.target;
  switch (el.id) {
    case 'selected-date':
      if (el.value) {
        S.date = el.value;
        render();
      }
      break;
    case 'habit-category':
      S.filter.category = el.value;
      render();
      break;
    case 'habit-status':
      S.filter.status = el.value;
      render();
      break;
    case 'category-routine':
      S.filter.routine = el.value;
      render();
      break;
    case 'share-permission':
      S.shareFilter.permission = el.value;
      render();
      break;
    case 'share-category-filter':
      S.shareFilter.category = el.value;
      render();
      break;
    case 'share-owner-filter':
      S.shareFilter.owner = el.value;
      render();
      break;
    case 'share-status-filter':
      S.shareFilter.status = el.value;
      render();
      break;
  }
  if (el.name === 'scope') {
    const cat = el.value === 'category';
    $('#share-habits-fields').hidden = cat;
    $('#share-category-fields').hidden = !cat;
  }
  if (el.name === 'permission') {
    const help = $('.permission-help', el.closest('form'));
    if (help) help.textContent = t(el.value + '_help');
  }
  if (el.name === 'status' && el.closest('[data-form=reviewCategory]'))
    $('[name=feedback]', el.closest('form')).required = el.value === 'rejected';
  if (el.name === 'category_id' && el.closest('[data-form=saveHabit]')) {
    const select = $('[name=routine_id]', el.closest('form'));
    if (select) {
      select.innerHTML =
        `<option value="">${t('no_routine')}</option>` +
        S.data.routines
          .filter((r) => Number(r.category_id) === Number(el.value))
          .map((r) => `<option value="${r.id}">${esc(r.name)}</option>`)
          .join('');
    }
  }
});
let searchTimer;
document.addEventListener('input', (event) => {
  const el = event.target;
  if (!['habit-search', 'share-search', 'user-search'].includes(el.id)) return;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const start = el.selectionStart;
    if (el.id === 'habit-search') S.filter.search = el.value;
    if (el.id === 'share-search') S.shareFilter.search = el.value;
    if (el.id === 'user-search') S.userSearch = el.value;
    const id = el.id;
    render();
    const input = $('#' + id);
    input?.focus();
    input?.setSelectionRange(start, start);
  }, 180);
});
document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (!form.dataset.form) return;
  event.preventDefault();
  const errorBox = $('.form-error', form);
  if (errorBox) errorBox.textContent = '';
  const submit = $('[type=submit]', form);
  if (submit.disabled) return;
  submit.disabled = true;
  const values = new FormData(form),
    d = Object.fromEntries(values);
  const action = form.dataset.form;
  try {
    if (d.confirm_password !== undefined && d.password !== d.confirm_password)
      throw new Error(t('password_mismatch'));
    delete d.confirm_password;
    if (['saveHabit', 'saveTemplate'].includes(action))
      d.schedule_days = values.getAll('schedule_days').map(Number);
    for (const name of [
      'notifications_enabled',
      'active',
      'admin',
      'registration_enabled',
      'include_future',
    ])
      if ($(`[name=${name}]`, form)) d[name] = values.has(name);
    if (action === 'share') {
      if (d.scope === 'category') d.habit_ids = [];
      else {
        d.habit_ids = values.getAll('habit_ids').map(Number);
        delete d.category_id;
        d.include_future = false;
      }
      delete d.scope;
    }
    if (action === 'shareMindSpace') {
      const [target, id] = String(d.resource || '').split(':');
      d.target = target; d.id = Number(id); delete d.resource;
    }
    if (['shareMindSpace', 'changeMindSpaceShare'].includes(action)) {
      d.permissions = Object.fromEntries(['edit','move','delete','share'].map(right => [right, values.has(`can_${right}`)]));
      for (const right of ['edit','move','delete','share']) delete d[`can_${right}`];
    }
    if (['register', 'login', 'setup'].includes(action)) {
      if (action === 'register') d.language = S.language;
      if (action === 'setup') d.token = S.setupToken;
      const r = await api(action, d);
      S.csrf = r.csrf;
      S.setupToken = null;
      history.replaceState(null, '', location.pathname);
      S.view = 'home';
      await bootstrap();
    } else if (action === 'shareMindSpace') {
      await api(action, d);
      if (S.sharedWorkspace) leaveSharedWorkspace();
      S.mode = 'personal'; S.view = 'sharing'; S.sharingTab = 'invitations'; S.sharePerson = d.email.trim().toLowerCase();
      S.shareFilter = { permission: '', category: '', owner: '', status: '', search: '' };
      await refresh(); closeModal(); toast(t('invitation_sent'));
    } else if (action === 'forgotPassword') {
      await api(action, { ...d, language: S.language });
      S.recoverySent = true;
      render();
    } else if (action === 'resetPassword') {
      const r = await api(action, { ...d, token: S.resetToken });
      S.csrf = r.csrf;
      S.resetToken = null;
      S.setupToken = null;
      S.authMode = 'login';
      S.passwordReset = true;
      await bootstrap();
    } else if (action === 'settings') {
      await api(action, d);
      await bootstrap();
      toast(t('saved'));
    } else if (action === 'password') {
      await api(action, d);
      form.reset();
      toast(t('password_updated'));
    } else
      await mutate(
        action,
        d,
        action === 'share'
          ? 'invitation_sent'
          : action === 'requestCategory'
            ? 'request_sent'
            : action === 'complete'
              ? 'undo_toast'
              : 'saved'
      );
  } catch (error) {
    if (errorBox) errorBox.textContent = error.message;
    else toast(error.message, true);
  } finally {
    submit.disabled = false;
  }
});
$('#modal').addEventListener('click', (event) => {
  if (event.target === $('#modal')) {
    const r = $('#modal').getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      closeModal();
  }
});
$('#modal').addEventListener('cancel', () => {
  S.confirmAction = null;
});
let refreshInFlight = false;
async function syncQuietly() {
  if (!S.user || document.hidden || refreshInFlight || S.busy) return;
  refreshInFlight = true;
  try {
    const userId = S.user.id;
    if ($('#modal').open || ['profile', 'settings'].includes(S.view) || pageControllers.home.isEditing()) {
      const snapshot = JSON.stringify([S.data.notifications, S.data.unread_notifications]);
      const data = await api('notifications');
      if (S.user?.id !== userId || JSON.stringify([S.data.notifications, S.data.unread_notifications]) !== snapshot) return;
      if (JSON.stringify([data.notifications, data.unread_notifications]) !== snapshot) {
        Object.assign(S.data, data); updateNotificationBadge();
      }
      return;
    }
    const snapshot = JSON.stringify(S.data);
    const data = await api('data');
    // A request started before typing, saving or switching accounts must not redraw stale data.
    if (S.user?.id !== userId || pageControllers.home.isEditing() || JSON.stringify(S.data) !== snapshot) return;
    if (JSON.stringify(data) !== snapshot) {
      S.data = data;
      render();
    }
  } catch (e) {
    if (e.status !== 401) console.warn('Background refresh unavailable');
  } finally {
    refreshInFlight = false;
  }
}
window.addEventListener('focus', syncQuietly);
document.addEventListener('visibilitychange', () => { if (!document.hidden) void syncQuietly(); });
setInterval(syncQuietly, 15000);
(async () => {
  const m = location.hash.match(/^#(setup|reset)=([a-f0-9]{64})$/);
  if (m) {
    S[m[1] === 'setup' ? 'setupToken' : 'resetToken'] = m[2];
    history.replaceState(null, '', location.pathname);
  }
  try {
    await bootstrap();
  } catch (error) {
    $('#app').innerHTML =
      `<main class="connection-state">${flower()}<h1>MyRemarkable Mind</h1><p>${esc(error.message)}</p><button class="btn primary" data-action="retry">Try again / Reintentar</button></main>`;
  }
})();
