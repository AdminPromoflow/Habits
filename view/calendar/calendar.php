<?php if (!defined('PROJECT_ROOT')) {
    http_response_code(404);
    exit();
} ?>
<template id="view-calendar">
  {{heading}}
  <div class="calendar-layout">
    <section class="card calendar-card">
      <div class="section-heading">
        <h2>{{month}}</h2>
        <div class="button-row">
          <button class="text-btn" data-action="today">{{todayLabel}}</button
          ><button class="icon-btn" data-action="month-prev" aria-label="{{previousLabel}}">
            {{previousIcon}}</button
          ><button class="icon-btn" data-action="month-next" aria-label="{{nextLabel}}">
            {{nextIcon}}
          </button>
        </div>
      </div>
      <div class="calendar-weekdays">{{weekdays}}</div>
      <div class="calendar-grid">{{cells}}</div>
    </section>
    <section class="card calendar-details">
      <span class="eyebrow">{{detailLabel}}</span>
      <h2>{{selectedDate}}</h2>
      {{habits}}
    </section>
  </div>
</template>
