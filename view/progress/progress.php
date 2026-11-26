<?php if (!defined('PROJECT_ROOT')) {
    http_response_code(404);
    exit();
} ?>
<template id="view-progress">
  <div class="progress-dashboard">
    {{heading}}
    <div class="progress-toolbar">
      <div class="segmented progress-tabs" role="tablist" aria-label="{{tabsLabel}}">{{tabs}}</div>
      <div class="progress-controls">{{controls}}</div>
    </div>
    <div id="progress-panel" role="tabpanel" aria-labelledby="{{activeTab}}">
      <section class="progress-overview">{{overview}}</section>
      <div class="progress-workspace">
        <section class="card progress-chart-card">
          <div class="progress-chart-heading"><div><h2>{{chartTitle}}</h2><p>{{chartHint}}</p></div>{{categoryFilter}}</div>
          <div class="progress-formula">{{formula}}</div>
          {{chart}}
          <div class="progress-legend">{{legend}}</div>
          <p class="progress-chart-help">{{chartHelp}}</p>
        </section>
        <section class="card progress-category-card">
          <h2>{{categoryTitle}}</h2><p>{{categoryHint}}</p>
          <div class="progress-category-list">{{categories}}</div>
        </section>
      </div>
      <section class="card progress-detail" id="progress-detail" aria-live="polite" aria-atomic="false">
        <div class="progress-detail-heading"><div><span class="progress-eyebrow">{{detailEyebrow}}</span><h2>{{detailTitle}}</h2></div><strong>{{detailCount}}</strong></div>
        {{detail}}
      </section>
      <p class="progress-explanation">{{explanation}}</p>
    </div>
  </div>
</template>
