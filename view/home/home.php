<?php if (!defined('PROJECT_ROOT')) {
    http_response_code(404);
    exit();
} ?>
<template id="view-home">
  <section class="home-page">
    <div class="page-heading home-heading">
      <h1>{{greeting}}</h1>
      <button class="btn primary" data-action="new-habit">{{plus}}{{newHabit}}</button>
    </div>
    <div class="mindmap-stage" id="mindmap-stage" aria-label="{{diagramLabel}}">{{content}}</div>
  </section>
</template>

<template id="view-diagram-start">
  <button type="button" class="btn primary create-diagram" data-action="create-diagram">
    {{label}}
  </button>
</template>

<template id="view-diagram-node">
  <div class="diagram-root" id="diagram-root">
    <div
      class="diagram-node"
      id="diagram-node"
      role="button"
      tabindex="0"
      aria-pressed="false"
      aria-label="{{nodeLabel}}"
      aria-describedby="diagram-interaction-hint diagram-status"
    >
      <textarea
        id="diagram-name"
        rows="1"
        maxlength="120"
        spellcheck="true"
        autocomplete="off"
        aria-label="{{label}}"
        placeholder="{{placeholder}}"
        aria-describedby="diagram-status"
        readonly
        tabindex="-1"
        aria-hidden="true"
      >
{{name}}</textarea>
    </div>
    <span id="diagram-interaction-hint" class="sr-only">{{hint}}</span>
    <div class="diagram-controls" id="diagram-controls" aria-hidden="true" hidden>
      <span class="diagram-handle diagram-handle-more">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 10h4v4H2zm8 0h4v4h-4zm8 0h4v4h-4z"/></svg>
      </span>
      <span class="diagram-handle diagram-handle-text">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><path d="M3 4h18M12 4v18"/></svg>
      </span>
      <span class="diagram-handle diagram-handle-add">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><path d="M12 2v20M2 12h20"/></svg>
      </span>
      <span class="diagram-handle diagram-handle-star">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><path d="M12 2v20M3 7l18 10M3 17 21 7"/></svg>
      </span>
      <span class="diagram-handle diagram-handle-arrows">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="m9 3-8 9 8 9zm6 0 8 9-8 9z"/></svg>
      </span>
    </div>
    <div id="diagram-status" class="diagram-status sr-only" role="status" aria-live="polite"></div>
  </div>
</template>
