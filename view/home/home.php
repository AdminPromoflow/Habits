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
  <div class="diagram-root">
    <label class="diagram-node" for="diagram-name">
      <span class="sr-only">{{label}}</span>
      <textarea
        id="diagram-name"
        rows="1"
        maxlength="120"
        spellcheck="true"
        autocomplete="off"
        aria-label="{{label}}"
        placeholder="{{placeholder}}"
        aria-describedby="diagram-status"
      >
{{name}}</textarea>
    </label>
    <div id="diagram-status" class="diagram-status sr-only" role="status" aria-live="polite"></div>
  </div>
</template>
