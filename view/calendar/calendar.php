<?php if (!defined('PROJECT_ROOT')) { http_response_code(404); exit(); } ?>
<template id="view-calendar">
  <div class="planner planner-notebook" data-mobile-document="planner-note" data-mobile-document-kind="planner">
    <h1 class="sr-only">{{title}}</h1>
    <div class="planner-note-toolbar">
      <button class="text-btn" data-action="today">{{todayLabel}}</button>
      <button class="btn secondary" data-action="planner-add">{{addIcon}}{{addLabel}}</button>
    </div>
    <div class="planner-paper-stage">
      <section class="planner-note" data-mode="{{mode}}" aria-labelledby="planner-note-title">
        <img class="planner-note-art" src="assets/planner/notepaper.png" alt="" aria-hidden="true" width="902" height="1272">
        {{content}}
      </section>
    </div>
  </div>
</template>
<template id="view-pendings">
  <section class="planner-pendings">{{heading}}{{content}}</section>
</template>
