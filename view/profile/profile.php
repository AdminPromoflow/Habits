<?php if (!defined('PROJECT_ROOT')) {
    http_response_code(404);
    exit();
} ?>
<template id="view-profile">
  {{heading}}
  <div class="profile-layout">
    <section class="card profile-summary">
      <span class="avatar large">{{avatar}}</span>
      <h2>{{userName}}</h2>
      <p>{{email}}</p>
      <div class="button-row">{{roles}}</div>
      <div class="privacy-line">{{lockIcon}}<span>{{privacyMessage}}</span></div>
    </section>
    <div>
      <section class="card">
        <h2>{{preferencesLabel}}</h2>
        <form data-form="settings">
          {{nameField}}
          <div class="form-grid">{{languageField}}{{timezoneField}}{{themeField}}</div>
          <p class="field-help">{{languageHint}}</p>
          {{notificationsField}}
          <p class="field-help">{{notificationsHint}}</p>
          <div class="form-error" role="alert"></div>
          <button class="btn primary" type="submit">{{saveLabel}}</button>
        </form>
      </section>
      <section class="card password-card">
        <h2>{{passwordLabel}}</h2>
        <form data-form="password">
          {{currentPasswordField}}
          <div class="form-grid">{{passwordField}}{{confirmPasswordField}}</div>
          <p class="field-help">{{passwordHint}}</p>
          <div class="form-error" role="alert"></div>
          <button class="btn secondary" type="submit">{{changePasswordLabel}}</button>
        </form>
      </section>
    </div>
  </div>
</template>
