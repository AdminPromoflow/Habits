const personalNav = ['home', 'mindspaces', 'calendar', 'progress', 'sharing', 'settings', 'profile'];
const adminNav = [
  'overview',
  'users',
  'categories',
  'requests',
  'templates',
  'statistics',
  'settings',
];

function langSwitch() {
  return `<div class="lang-switch" role="group" aria-label="${esc(t('language'))}"><button data-action="language" data-lang="en" aria-pressed="${S.language === 'en'}" class="${S.language === 'en' ? 'selected' : ''}">English</button><span>|</span><button data-action="language" data-lang="es" aria-pressed="${S.language === 'es'}" class="${S.language === 'es' ? 'selected' : ''}">Español</button></div>`;
}

function notificationCount() { return S.data.unread_notifications ?? S.data.notifications.filter(n => !Number(n.is_read)).length; }
function notificationLabel() { const count = notificationCount(); return count ? t('notifications_unread', {count}) : t('notifications'); }
function notificationBadge() { const count = notificationCount(); return count ? `<span class="notification-badge" aria-hidden="true">${count > 99 ? '99+' : count}</span>` : ''; }
function hasMindSpaceTarget() {
  const params = new URL(location.href).searchParams;
  return ['space', 'folder', 'item', 'diagram'].some(key => params.has(key));
}
function initialPersonalView() {
  const requested = new URL(location.href).searchParams.get('view');
  return hasMindSpaceTarget() || requested === 'mindspaces' ? 'mindspaces' : ['calendar','pendings','habits'].includes(requested) ? requested : 'home';
}
function updateNotificationBadge() {
  const bell = document.querySelector('[data-action="notifications"]');
  if (!bell) return;
  bell.setAttribute('aria-label', notificationLabel());
  bell.innerHTML = icon('bell') + notificationBadge();
}

function render() {
  document.documentElement.lang = S.language;
  document.body.dataset.theme = S.user?.theme || 'light';
  document.title = `MyRemarkable Mind · ${t(S.mode === 'admin' ? 'admin_dashboard' : S.view === 'pendings' ? 'planner_pendings' : S.view === 'habits' ? 'categories' : S.view === 'categoryWeek' ? 'weekly_plan' : S.view === 'routine' ? 'routine' : S.view)}`;
  pageControllers.calendar.unmount();
  $('#app').innerHTML = S.user && !S.setupToken && !S.resetToken ? shell() : authPage();
  mobileDocumentView.sync();
  if (S.user && S.mode === 'personal' && S.view === 'calendar') pageControllers.calendar.mount();
  if (S.user && S.mode === 'personal' && ((S.view === 'mindspaces' && hasMindSpaceTarget()) || S.sharedWorkspace)) {
    pageControllers.home.mount();
    if (S.sharedWorkspace) mountSharedWorkspace();
  }
  mainScrollNavigation.sync();
}

function shell() {
  const admin = S.mode === 'admin';
  const nav = admin ? adminNav : personalNav;
  const pending = [...S.data.incoming, ...(S.data.mindspace_shares?.incoming || [])].filter((n) => n.status === 'pending').length;
  // Resolve the selected document before highlighting its MindSpace in navigation.
  const content = admin ? adminPage() : personalPage();
  return renderTemplate('layout', {
    brandIcon: flower(),
    brandCaption: t('brand_caption'),
    navCaption: t(admin ? 'admin_space' : 'personal_space'),
    navigation: nav
      .map(
        (v) =>
          !admin && v === 'sharing' ? sharingSidebar(pending) :
          !admin && v === 'mindspaces' ? pageControllers.home.mindspace.sidebar() :
          `<button data-view="${v}" class="nav-item ${S.view === v || (v === 'calendar' && ['pendings','habits','routine', 'categoryWeek'].includes(S.view)) ? 'active' : ''}" ${S.view === v || (v === 'calendar' && ['pendings','habits','routine','categoryWeek'].includes(S.view)) ? 'aria-current="page"' : ''}>${icon({ mindspaces: 'overview', users: 'sharing', requests: 'book', templates: 'habits', statistics: 'progress' }[v] || v)}<span>${t(v)}</span>${v === 'sharing' && pending ? `<span class="nav-count">${pending}</span>` : ''}</button>`
      )
      .join(''),
    reminderIcon: icon('leaf'),
    reminderText: t('app_tagline'),
    reminderCaption: t('week_caption'),
    modeSwitch: S.user.roles.includes('admin')
      ? `<button class="mode-switch" data-action="switch-mode">${icon('shield')}<span>${t(admin ? 'switch_personal' : 'switch_admin')}</span></button>`
      : '',
    avatar: esc(S.user.name.slice(0, 1)),
    userName: esc(S.user.name),
    spaceName: t(admin ? 'admin_dashboard' : 'personal_space'),
    logoutLabel: t('logout'),
    logoutTitle: t('logout'),
    logoutIcon: icon('logout'),
    menuIcon: icon('menu'),
    dashboardLabel: t(admin ? 'admin_dashboard' : 'personal_dashboard'),
    breadcrumbIcon: icon('chevron'),
    pageTitle: t(
      S.view === 'pendings' ? 'planner_pendings' : S.view === 'habits' ? 'categories' : S.view === 'categoryWeek' ? 'weekly_plan' : S.view === 'routine' ? 'routine' : S.view
    ),
    languageSwitch: langSwitch(),
    notificationsLabel: esc(notificationLabel()),
    bellIcon: icon('bell'),
    unreadDot: notificationBadge(),
    profileLabel: t('profile'),
    profileAvatar: esc(S.user.name.slice(0, 1)),
    content,
    footerIcon: flower(),
    privacyNote: t('privacy_note'),
  });
}

function personalPage() {
  const content = (
    {
      home: () => pageControllers.home.mindspace.homeList(),
      mindspaces: () => hasMindSpaceTarget() ? homePage() : pageControllers.home.mindspace.directory(),
      habits: habitsPage,
      categoryWeek: categoryWeekPage,
      routine: routinePage,
      settings: categoriesPage,
      calendar: calendarPage,
      pendings: plannerPendingsPage,
      progress: progressPage,
      categories: categoriesPage,
      sharing: sharingPage,
      profile: profilePage,
    }[S.view] || (() => pageControllers.home.mindspace.homeList())
  )();
  if (!['calendar','pendings'].includes(S.view)) return content;
  return `<div class="planner-section-tabs" role="tablist" aria-label="${esc(t('planner_sections'))}">${['calendar','pendings'].map(view=>`<button id="planner-section-${view}" role="tab" aria-selected="${view === S.view}" aria-controls="planner-section-content" tabindex="${view === S.view ? 0 : -1}" data-view="${view}">${icon(view === 'calendar' ? 'calendar' : 'clock')}${t(view === 'calendar' ? 'calendar' : 'planner_pendings')}</button>`).join('')}</div><section id="planner-section-content" role="tabpanel" aria-labelledby="planner-section-${S.view}">${content}</section>`;
}

async function navigate(view) {
  if (S.sharedWorkspace) {
    if (!await pageControllers.home.mindspace.flush()) return;
    leaveSharedWorkspace();
  }
  if (S.view === 'mindspaces' && pageControllers.home.mindspace.enabled() && !await pageControllers.home.mindspace.flush()) return;
  if (S.mode === 'personal' && view === 'categories') view = 'settings';
  if (view === 'sharing') {
    setSharingSidebarOpen(true);
    S.sharingTab = 'all'; S.sharePerson = null;
    S.shareFilter = { permission: '', category: '', owner: '', status: '', search: '' };
  }
  if (view === 'calendar') { S.plannerMode = 'note'; S.plannerPage = 0; S.plannerCategoryScroll = 0; S.date = today(); S.month = S.date.slice(0, 7); }
  if (view === 'habits') {
    S.filter = { category: '', routine: '', status: 'active', search: '' };
    S.categoryId = null;
  }
  if (
    S.mode === 'admin' &&
    personalNav.includes(view) &&
    !adminNav.includes(view) &&
    view !== 'profile'
  )
    view = 'overview';
  if (S.mode === 'personal' && ['home', 'mindspaces', 'calendar','pendings','habits'].includes(view)) {
    const url = new URL(location.href);
    for (const key of ['view', 'diagram', 'topic', 'item', 'folder', 'space', 'cell', 'card', 'column', 'habit']) url.searchParams.delete(key);
    if (view !== 'home') url.searchParams.set('view', view);
    history.replaceState(null, '', url.href);
    pageControllers.home.reset();
  }
  S.view = view;
  S.filter.routine = '';
  document.body.classList.remove('menu-open');
  if (S.mode === 'admin' && !S.admin) S.admin = await api('admin');
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (view === 'profile' && !S.timezones) {
    S.timezones = await api('timezones');
    render();
  }
}
