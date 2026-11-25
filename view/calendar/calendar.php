<?php if (!defined('PROJECT_ROOT')) { http_response_code(404); exit(); } ?>
<template id="view-calendar">
  <div class="planner">
    {{heading}}
    <div class="planner-toolbar">
      <div class="planner-week-summary">
        <span class="planner-week-badge">{{weekIcon}}{{weekLabel}}</span>
        <h2 class="planner-period" id="planner-period" aria-live="polite">{{title}}</h2>
      </div>
      <div class="planner-navigation">
        <button class="text-btn" data-action="today">{{todayLabel}}</button>
        <button class="icon-btn" data-action="planner-prev" aria-label="{{previousLabel}}">{{previousIcon}}</button>
        <button class="icon-btn" data-action="planner-next" aria-label="{{nextLabel}}">{{nextIcon}}</button>
        <input type="date" id="planner-date" value="{{date}}" min="1000-01-01" max="9998-12-31" aria-label="{{dateLabel}}">
      </div>
    </div>
    <div id="planner-panel">{{content}}</div>
    <p class="planner-hint">{{hintIcon}}{{hint}}</p>
  </div>
</template>
