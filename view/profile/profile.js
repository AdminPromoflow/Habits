function profilePage() {
  return renderTemplate('profile', {
    heading: heading(t('profile'), t('profile_subtitle')),
    avatar: esc(S.user.name.slice(0, 1)),
    userName: esc(S.user.name),
    email: esc(S.user.email),
    roles: S.user.roles.map((r) => badge(r)).join(''),
    lockIcon: icon('lock'),
    privacyMessage: t('private_promise'),
    preferencesLabel: t('preferences'),
    nameField: field('name', 'name', 'text', S.user.name, { required: true, maxlength: 100 }),
    languageField: selectField(
      'language',
      'language',
      [
        ['en', 'English'],
        ['es', 'Español'],
      ],
      S.language
    ),
    timezoneField: selectField(
      'timezone',
      'timezone',
      getTimezones().map((z) => [z, z]),
      S.user.timezone
    ),
    themeField: selectField(
      'theme',
      'theme',
      [
        ['light', t('light')],
        ['dark', t('dark')],
      ],
      S.user.theme
    ),
    languageHint: t('language_hint'),
    notificationsField: checkbox(
      'notifications_enabled',
      'notifications',
      Number(S.user.notifications_enabled) === 1
    ),
    notificationsHint: t('notifications_hint'),
    saveLabel: t('save'),
    passwordLabel: t('change_password'),
    currentPasswordField: field('current_password', 'current_password', 'password', '', {
      autocomplete: 'current-password',
      required: true,
      maxlength: 72,
    }),
    passwordField: field('password', 'new_password', 'password', '', {
      autocomplete: 'new-password',
      required: true,
      minlength: 12,
      maxlength: 72,
    }),
    confirmPasswordField: field('confirm_password', 'confirm_password', 'password', '', {
      autocomplete: 'new-password',
      required: true,
      minlength: 12,
      maxlength: 72,
    }),
    passwordHint: t('password_hint'),
    changePasswordLabel: t('change_password'),
  });
}

function getTimezones() {
  return (
    S.timezones || [
      ...new Set(
        [
          S.user?.timezone,
          'America/Bogota',
          'America/New_York',
          'America/Los_Angeles',
          'America/Mexico_City',
          'America/Argentina/Buenos_Aires',
          'Europe/Madrid',
          'Europe/London',
          'UTC',
        ].filter(Boolean)
      ),
    ]
  );
}

class ProfilePage extends PageController {
  constructor() {
    super([]);
  }

  async handleAction(action, el, id) {
    switch (action) {
    }
  }
}
