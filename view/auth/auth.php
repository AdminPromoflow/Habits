<?php if (!defined('PROJECT_ROOT')) {
    http_response_code(404);
    exit();
} ?>
<template id="view-auth">
  <main class="auth-layout">
    <section class="auth-form-panel">
      <a class="brand" href="#"
        >{{brandIcon}}<span>MyRemarkable Mind<small>{{brandCaption}}</small></span></a
      >
      <div class="auth-language">{{languageSwitch}}</div>
      <div class="auth-form-wrap">
        <span class="eyebrow">MyRemarkable Mind</span>
        <h1>{{title}}</h1>
        <p class="lead">{{subtitle}}</p>
        {{resetNotice}} {{form}} {{accountLinks}}
        <div class="privacy-line">{{lockIcon}}<span>{{privacyMessage}}</span></div>
      </div>
      <p class="auth-footer">© 2026 MyRemarkable Mind <span>{{footerNote}}</span></p>
    </section>
    <section class="auth-art">
      <div class="art-text">
        <span class="eyebrow">{{eyebrow}}</span>
        <h2>{{artTitle}}</h2>
        <p>{{artCaption}}</p>
      </div>
      <div class="garden" aria-hidden="true">
        <div class="garden-sun"></div>
        <div class="garden-orbit"></div>
        <div class="garden-pot"></div>
        <div class="garden-stem"></div>
        <i class="garden-leaf leaf-one"></i><i class="garden-leaf leaf-two"></i
        ><i class="garden-leaf leaf-three"></i>
        <div class="garden-blossom">✳</div>
        <span class="garden-star star-one">✧</span><span class="garden-star star-two">✦</span>
        <div class="floating-note">{{checkIcon}}<span>{{tagline}}</span></div>
      </div>
      <div class="art-bottom"><span>01 — 02 — 03</span>{{artNote}}</div>
    </section>
  </main>
</template>
