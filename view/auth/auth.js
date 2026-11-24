function authPage() {
  const register = S.authMode === 'register',
    setup = !!S.setupToken,
    reset = !!S.resetToken,
    forgot = !setup && !reset && S.authMode === 'forgot';
  const newPassword = register || setup || reset;
  const title = reset
    ? 'reset_title'
    : setup
      ? 'setup_title'
      : forgot
        ? 'forgot_password'
        : register
          ? 'register_title'
          : 'welcome_back';
  const subtitle = reset
    ? 'reset_subtitle'
    : setup
      ? 'setup_subtitle'
      : forgot
        ? 'forgot_subtitle'
        : register
          ? 'register_subtitle'
          : 'login_subtitle';
  const action = reset
    ? 'resetPassword'
    : setup
      ? 'setup'
      : forgot
        ? 'forgotPassword'
        : register
          ? 'register'
          : 'login';
  const submit = reset
    ? 'reset_action'
    : setup
      ? 'setup_action'
      : forgot
        ? 'send_reset'
        : register
          ? 'register'
          : 'login';
  return renderTemplate('auth', {
    brandIcon: flower(),
    brandCaption: t('brand_caption'),
    languageSwitch: langSwitch(),
    title: t(title),
    subtitle: t(subtitle),
    resetNotice: S.passwordReset ? `<p class="auth-notice" role="status">${t('reset_success')}</p>` : '',
    form:
      forgot && S.recoverySent
        ? `<p class="auth-notice" role="status">${t('reset_sent')}</p>`
        : `<form id="auth-form" data-form="${action}">
 ${register ? field('name', 'name', 'text', '', { autocomplete: 'name', required: true, maxlength: 100 }) : ''}
 ${!setup && !reset ? field('email', 'email', 'email', '', { autocomplete: 'username', required: true, maxlength: 190 }) : ''}
 ${!forgot ? field('password', reset ? 'new_password' : 'password', 'password', '', { autocomplete: newPassword ? 'new-password' : 'current-password', required: true, minlength: newPassword ? 12 : 1, maxlength: 72 }) : ''}
 ${newPassword ? `<p class="field-help">${t('password_hint')}</p>${field('confirm_password', 'confirm_password', 'password', '', { autocomplete: 'new-password', required: true, minlength: 12, maxlength: 72 })}` : ''}
 <div class="form-error" role="alert"></div><button class="btn primary full" type="submit">${t(submit)}${icon('sparkles')}</button></form>`,
    accountLinks:
      forgot || reset || setup
        ? `<p class="auth-alternate"><button class="text-btn" data-action="back-login">${t('back_login')}</button></p>`
        : `<p class="auth-alternate">${t(register ? 'have_account' : 'no_account')} ${S.registration || register ? `<button class="text-btn" data-action="auth-toggle">${t(register ? 'login' : 'register')}</button>` : ''}</p>${!register ? `<p class="center"><button class="text-btn" data-action="forgot-password">${t('forgot_password')}</button></p>` : ''}`,
    lockIcon: icon('lock'),
    privacyMessage: t('private_promise'),
    footerNote: t('auth_note'),
    eyebrow: t('auth_eyebrow'),
    artTitle: esc(t('auth_title')).replaceAll('\\n', '<br>'),
    artCaption: t('auth_caption'),
    checkIcon: icon('check'),
    tagline: t('app_tagline'),
    artNote: t('auth_note'),
  });
}

class AuthPage extends PageController {
  constructor() {
    super(['auth-toggle', 'forgot-password', 'back-login']);
  }

  async handleAction(action, el, id) {
    switch (action) {
      case 'auth-toggle':
        S.authMode = S.authMode === 'register' ? 'login' : 'register';
        S.passwordReset = false;
        render();
        break;
      case 'forgot-password':
        S.authMode = 'forgot';
        S.recoverySent = false;
        S.passwordReset = false;
        render();
        break;
      case 'back-login':
        S.authMode = 'login';
        S.setupToken = null;
        S.resetToken = null;
        S.recoverySent = false;
        render();
        break;
    }
  }
}
