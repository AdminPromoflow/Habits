<?php if (!defined('PROJECT_ROOT')) {
    http_response_code(404);
    exit();
} ?>
<template id="view-home">
  <section class="home-page">
    <div class="page-heading home-heading">
      <h1>{{greeting}}</h1>
      <button type="button" class="btn primary" id="create-diagram" data-action="create-diagram" {{createDisabled}}>{{plus}}{{createLabel}}</button>
    </div>
    <div class="diagram-toolbar" id="diagram-toolbar">{{diagramToolbar}}</div>
    <div class="mindmap-stage" id="mindmap-stage" tabindex="-1" aria-label="{{diagramLabel}}">{{content}}</div>
  </section>
</template>

<template id="view-diagram-toolbar">
  {{linkNavigation}}
  <div class="diagram-picker">
    <button type="button" id="diagram-select" class="diagram-picker-trigger" data-action="toggle-diagram-picker"
      aria-label="{{triggerLabel}}" aria-haspopup="menu" aria-expanded="{{expanded}}" aria-controls="diagram-picker-options" {{disabled}}>
      <span class="diagram-picker-title">{{selectedName}}</span>
      <svg class="diagram-picker-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 9 7 7 7-7"/></svg>
    </button>
    <div id="diagram-picker-options" class="diagram-picker-options" role="menu" aria-label="{{label}}" {{hidden}}>{{options}}</div>
  </div>
</template>

<template id="view-diagram-title">
  <div class="diagram-title" id="diagram-title">
    <button type="button" id="diagram-title-label" aria-label="{{label}}" title="{{hint}}">{{name}}</button>
    <input type="text" id="diagram-title-input" maxlength="120" value="{{name}}"
      aria-label="{{label}}" autocomplete="off" spellcheck="true" hidden>
  </div>
</template>

<template id="view-diagram-node">
  <div class="diagram-root" data-node-key="{{nodeKey}}" id="diagram-root{{suffix}}">
    <div class="diagram-node-body">
    <div
      class="diagram-node"
      id="diagram-node{{suffix}}"
      role="button"
      tabindex="0"
      aria-pressed="false"
      aria-label="{{nodeLabel}}"
      aria-describedby="diagram-interaction-hint{{suffix}} diagram-status{{suffix}}"
    >
      {{image}}
      <input type="checkbox" class="diagram-task-checkbox" id="diagram-checkbox{{suffix}}"
        aria-label="{{checkboxTaskLabel}}" hidden>
      <textarea
        id="diagram-name{{suffix}}"
        rows="1"
        maxlength="120"
        spellcheck="true"
        autocomplete="off"
        aria-label="{{label}}"
        placeholder="{{placeholder}}"
        aria-describedby="diagram-status{{suffix}}"
        readonly
        tabindex="-1"
        aria-hidden="true"
      >
{{name}}</textarea>
      {{insideLabels}}
    </div>
    {{topicLink}}
    <span id="diagram-interaction-hint{{suffix}}" class="sr-only">{{hint}}</span>
    <div class="diagram-controls" id="diagram-controls{{suffix}}" hidden>
      <button type="button" class="diagram-handle diagram-handle-more" id="diagram-more{{suffix}}"
        data-action="toggle-diagram-menu" aria-label="{{menuLabel}}" title="{{menuLabel}}"
        aria-controls="diagram-menu{{suffix}}" aria-expanded="false" aria-haspopup="menu">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2 10h4v4H2zm8 0h4v4h-4zm8 0h4v4h-4z"/></svg>
      </button>
      <span class="diagram-handle diagram-handle-text" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><path d="M3 4h18M12 4v18"/></svg>
      </span>
      <button type="button" class="diagram-handle diagram-handle-add" data-action="add-diagram-child" aria-label="{{addChildLabel}}" title="{{addChildHint}}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><path d="M12 2v20M2 12h20"/></svg>
      </button>
      <button type="button" class="diagram-handle diagram-handle-star" data-action="add-diagram-sibling" aria-label="{{addSiblingLabel}}" title="{{addSiblingLabel}}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><path d="M12 2v20M3 7l18 10M3 17 21 7"/></svg>
      </button>
      <button type="button" class="diagram-handle diagram-handle-arrows" id="diagram-width{{suffix}}"
        role="slider" aria-label="{{widthLabel}}" title="{{widthHint}}"
        aria-orientation="horizontal" aria-valuemin="100" aria-valuemax="600" aria-valuenow="{{width}}">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m9 3-8 9 8 9zm6 0 8 9-8 9z"/></svg>
      </button>
    </div>
    <div class="diagram-menu" id="diagram-menu{{suffix}}" role="menu" aria-label="{{menuLabel}}" hidden>
      <div class="diagram-menu-row" role="presentation">
        <button type="button" role="menuitem" data-action="copy-diagram-node" aria-label="{{copyLabel}}" title="{{copyLabel}}">{{copyIcon}}</button>
        <button type="button" role="menuitem" data-action="cut-diagram-node" aria-label="{{cutLabel}}" title="{{cutLabel}}">{{cutIcon}}</button>
        <button type="button" role="menuitem" id="diagram-paste{{suffix}}" data-action="paste-diagram-node" {{pasteDisabled}} aria-label="{{pasteLabel}}" title="{{pasteLabel}}">{{pasteIcon}}</button>
        <button type="button" role="menuitem" data-action="delete-diagram-node" aria-label="{{trashLabel}}" title="{{trashLabel}}">{{trashIcon}}</button>
        <button type="button" role="menuitem" data-action="image-diagram-node" aria-label="{{imageLabel}}" title="{{imageLabel}}">{{imageIcon}}</button>
        <button type="button" role="menuitem" disabled aria-label="{{formatLabel}}" title="{{formatLabel}}">{{formatIcon}}</button>
      </div>
      <div class="diagram-menu-row" role="presentation">
        <button type="button" role="menuitem" data-action="link-diagram-node" aria-label="{{linkLabel}}" title="{{linkLabel}}">{{linkIcon}}</button>
        <button type="button" role="menuitem" id="diagram-checkbox-tool{{suffix}}" data-action="diagram-checkbox-menu"
          aria-haspopup="menu" aria-expanded="false" aria-controls="diagram-checkbox-menu{{suffix}}"
          aria-label="{{checkboxLabel}}" title="{{checkboxLabel}}">{{checkboxIcon}}</button>
        <button type="button" role="menuitem" disabled aria-label="{{calendarLabel}}" title="{{calendarLabel}}">{{calendarIcon}}</button>
        <button type="button" role="menuitem" data-action="labels-diagram-node" aria-label="{{tagLabel}}" title="{{tagLabel}}">{{tagIcon}}</button>
        <button type="button" role="menuitem" data-action="diagram-layout" aria-label="{{branchLabel}}" title="{{branchLabel}}">{{branchIcon}}</button>
        <button type="button" role="menuitem" disabled aria-label="{{resizeLabel}}" title="{{resizeLabel}}">{{resizeIcon}}</button>
      </div>
      <div class="diagram-checkbox-menu" id="diagram-checkbox-menu{{suffix}}" role="group" aria-label="{{checkboxLabel}}" hidden>
        <fieldset class="diagram-checkbox-scope">
          <legend>{{checkboxScopeLabel}}</legend>
          <label><input type="radio" class="diagram-checkbox-scope-option" id="diagram-checkbox-scope-node{{suffix}}" name="diagram-checkbox-scope{{suffix}}" value="node" checked><span>{{checkboxScopeNodeLabel}}</span></label>
          <label><input type="radio" class="diagram-checkbox-scope-option" id="diagram-checkbox-scope-branch{{suffix}}" name="diagram-checkbox-scope{{suffix}}" value="branch"><span>{{checkboxScopeBranchLabel}}</span></label>
        </fieldset>
        <div role="menu" aria-label="{{checkboxLabel}}">
        <button type="button" role="menuitemradio" aria-checked="false" id="diagram-checkbox-none{{suffix}}" data-action="diagram-checkbox-state" data-state="none"><span class="diagram-option-check" aria-hidden="true">✓</span>{{checkboxNoneLabel}}</button>
        <button type="button" role="menuitem" id="diagram-checkbox-toggle{{suffix}}" data-action="diagram-checkbox-state" data-state="toggle"><span></span>{{checkboxToggleLabel}}</button>
        <div role="separator"></div>
        <button type="button" role="menuitemradio" aria-checked="false" id="diagram-checkbox-unchecked{{suffix}}" data-action="diagram-checkbox-state" data-state="unchecked"><span class="diagram-option-check" aria-hidden="true">✓</span>{{checkboxUncheckedLabel}}</button>
        <button type="button" role="menuitemradio" aria-checked="false" id="diagram-checkbox-checked{{suffix}}" data-action="diagram-checkbox-state" data-state="checked"><span class="diagram-option-check" aria-hidden="true">✓</span>{{checkboxCheckedLabel}}</button>
        </div>
      </div>
    </div>
    <div id="diagram-status{{suffix}}" class="diagram-status sr-only" role="status" aria-live="polite"></div>
    </div>
    {{outsideLabels}}
  </div>
</template>

<template id="view-diagram-tree">
  <div class="diagram-scene" id="diagram-scene">
    <svg class="diagram-connections" id="diagram-connections"></svg>
    {{nodes}}
  </div>
</template>
