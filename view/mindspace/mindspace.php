<?php if (!defined('PROJECT_ROOT')) { http_response_code(404); exit; } ?>
<template id="view-mindspace">
  <section class="home-page mindspace-page">
    <div class="page-heading home-heading"><div><h1>MindSpace</h1><p class="muted">{{intro}}</p></div></div>
    <section class="mindspace-shell" aria-label="MindSpace">
      <div class="mindspace-tabbar"><div id="mindspace-tabs" class="mindspace-tabs" role="tablist" aria-label="{{tabsLabel}}">{{tabs}}</div>
        <button type="button" class="mindspace-add" data-action="ms-new" aria-label="{{addLabel}}" title="{{addLabel}}">{{plus}}</button>
      </div>
      <div class="mindspace-body">
        <aside class="mindspace-explorer" aria-label="{{explorerLabel}}">{{explorer}}</aside>
        <div class="mindspace-main">
          <header class="mindspace-item-header"><nav class="mindspace-folder-path" aria-label="{{pathLabel}}">{{path}}</nav>
            <div class="mindspace-item-title"><h2 id="mindspace-item-name">{{name}}</h2><div class="button-row">{{actions}}</div></div>
            <div id="mindspace-save-status" class="mindspace-save-status" role="status" aria-live="polite"></div>
          </header>
          <div id="mindspace-panel" class="mindspace-panel" role="tabpanel" tabindex="-1" aria-label="{{name}}">{{content}}</div>
        </div>
      </div>
    </section>
  </section>
</template>
<template id="view-mindspace-diagram">
  <div id="diagram-toolbar" class="diagram-toolbar mindspace-legacy-picker" hidden>{{diagramToolbar}}</div>
  <div class="mindmap-workspace">
    <div class="diagram-canvas-navigation" id="diagram-canvas-navigation">{{linkNavigation}}</div>
    <div class="mindmap-stage" id="mindmap-stage" tabindex="-1" aria-label="{{diagramLabel}}">{{content}}</div>
  </div>
</template>
