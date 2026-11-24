const personalNav = ['home', 'habits', 'calendar', 'progress', 'sharing', 'settings', 'profile'];
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

function render() {
  document.documentElement.lang = S.language;
  document.body.dataset.theme = S.user?.theme || 'light';
  document.title = `MyRemarkable Mind · ${t(S.mode === 'admin' ? 'admin_dashboard' : S.view === 'categoryWeek' ? 'weekly_plan' : S.view === 'routine' ? 'routine' : S.view)}`;
  $('#app').innerHTML = S.user && !S.setupToken && !S.resetToken ? shell() : authPage();
  if (S.user && S.mode === 'personal' && S.view === 'home') pageControllers.home.mount();
}

function shell() {
  const admin = S.mode === 'admin';
  const nav = admin ? adminNav : personalNav;
  const unread = S.data.notifications.filter((n) => !Number(n.is_read)).length;
  const pending = S.data.incoming.filter((n) => n.status === 'pending').length;
  return renderTemplate('layout', {
    brandIcon: flower(),
    brandCaption: t('brand_caption'),
    navCaption: t(admin ? 'admin_space' : 'personal_space'),
    navigation: nav
      .map(
        (v) =>
          `<button data-view="${v}" class="nav-item ${S.view === v || (v === 'habits' && ['routine', 'categoryWeek'].includes(S.view)) ? 'active' : ''}">${icon({ users: 'sharing', requests: 'book', templates: 'habits', statistics: 'progress' }[v] || v)}<span>${t(v)}</span>${v === 'sharing' && pending ? `<span class="nav-count">${pending}</span>` : ''}</button>`
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
      S.view === 'categoryWeek' ? 'weekly_plan' : S.view === 'routine' ? 'routine' : S.view
    ),
    languageSwitch: langSwitch(),
    notificationsLabel: t('notifications'),
    bellIcon: icon('bell'),
    unreadDot: unread ? '<span class="unread-dot"></span>' : '',
    profileLabel: t('profile'),
    profileAvatar: esc(S.user.name.slice(0, 1)),
    content: admin ? adminPage() : personalPage(),
    footerIcon: flower(),
    privacyNote: t('privacy_note'),
  });
}

function personalPage() {
  return (
    {
      home: homePage,
      habits: habitsPage,
      categoryWeek: categoryWeekPage,
      routine: routinePage,
      settings: categoriesPage,
      calendar: calendarPage,
      progress: progressPage,
      categories: categoriesPage,
      sharing: sharingPage,
      profile: profilePage,
    }[S.view] || homePage
  )();
}

async function navigate(view) {
  if (S.mode === 'personal' && view === 'categories') view = 'settings';
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
