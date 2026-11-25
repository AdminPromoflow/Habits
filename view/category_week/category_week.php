<?php if (!defined('PROJECT_ROOT')) {
    http_response_code(404);
    exit();
} ?>
<template id="view-category_week">
  <button class="text-btn back-btn" data-view="habits">{{backIcon}}{{backLabel}}</button>{{heading}}
  <div class="filter-bar">
    <label class="search-field"
      >{{searchIcon}}<input
        id="habit-search"
        value="{{searchValue}}"
        placeholder="{{searchPlaceholder}}"
        aria-label="{{searchLabel}}" /></label
    >{{routineFilter}}{{statusFilter}}
  </div>
  <div class="routine-toolbar">
    <div class="date-control">
      <button class="icon-btn" data-action="week-prev" aria-label="{{previousLabel}}">
        {{previousIcon}}</button
      ><input
        type="date"
        id="selected-date"
        value="{{dateValue}}"
        aria-label="{{dateLabel}}"
      /><button class="icon-btn" data-action="week-next" aria-label="{{nextLabel}}">
        {{nextIcon}}</button
      ><button class="text-btn" data-action="today">{{todayLabel}}</button>
    </div>
    <span class="badge mint">{{startDate}} – {{endDate}}</span>
  </div>
  <p class="muted">{{note}}</p>
  {{templates}}{{board}}{{tasks}}
</template>
