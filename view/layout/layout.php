<?php if (!defined('PROJECT_ROOT')) {
    http_response_code(404);
    exit();
} ?>
<template id="view-layout">
  <div class="layout">
    <aside class="sidebar">
      <a class="brand" href="#" data-view="home"
        >{{brandIcon}}<span>MyRemarkable Mind<small>{{brandCaption}}</small></span></a
      ><span class="nav-caption">{{navCaption}}</span>
      <nav>{{navigation}}</nav>
      <div class="sidebar-reminder">
        {{reminderIcon}}
        <p>{{reminderText}}</p>
        <span>{{reminderCaption}}</span>
      </div>
      <div class="sidebar-bottom">
        {{modeSwitch}}
        <div class="user-summary">
          <span class="avatar">{{avatar}}</span>
          <div><strong>{{userName}}</strong><small>{{spaceName}}</small></div>
          <button
            class="icon-btn"
            data-action="logout"
            aria-label="{{logoutLabel}}"
            title="{{logoutTitle}}"
          >
            {{logoutIcon}}
          </button>
        </div>
      </div>
    </aside>
    <div class="sidebar-backdrop" data-action="menu"></div>
    <div class="workspace">
      <header class="topbar">
        <div class="breadcrumb">
          <button class="icon-btn mobile-menu" data-action="menu" aria-label="Menu">
            {{menuIcon}}</button
          ><span>{{dashboardLabel}}</span>{{breadcrumbIcon}}<strong>{{pageTitle}}</strong>
        </div>
        <div class="topbar-actions">
          {{languageSwitch}}<button
            class="icon-btn notification-btn"
            data-action="notifications"
            aria-label="{{notificationsLabel}}"
          >
            {{bellIcon}}{{unreadDot}}</button
          ><button class="avatar small" data-view="profile" aria-label="{{profileLabel}}">
            {{profileAvatar}}
          </button>
        </div>
      </header>
      <main id="main" tabindex="-1">{{content}}</main>
      <footer class="workspace-footer">
        {{footerIcon}}<span>{{privacyNote}}</span><span>MyRemarkable Mind</span>
      </footer>
    </div>
  </div>
</template>
