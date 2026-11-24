<?php if (!defined('PROJECT_ROOT')) {
    http_response_code(404);
    exit();
} ?>
<template id="view-progress">
  {{heading}}
  <div class="progress-stats">
    <article class="card metric">
      {{checkIcon}}<strong>{{completions}}</strong><span>{{completionsLabel}}</span>
    </article>
    <article class="card metric">
      {{progressIcon}}<strong>{{percent}}%</strong><span>{{percentLabel}}</span>
    </article>
    <article class="card metric">
      {{streakIcon}}<strong>{{streak}}</strong><span>{{streakLabel}}</span>
    </article>
  </div>
  <div class="progress-columns">
    <section class="card">
      <div class="section-heading">
        <h2>{{consistencyLabel}}</h2>
        {{privacyBadge}}
      </div>
      <div class="bar-chart">{{bars}}</div>
    </section>
    <section class="card">
      <h2>{{categoryLabel}}</h2>
      <div class="category-progress">{{categories}}</div>
    </section>
  </div>
  <section class="card heatmap-card">
    <div class="section-heading">
      <h2>{{activityLabel}}</h2>
      <span class="muted">{{startDate}} – {{endDate}}</span>
    </div>
    <div class="heatmap">{{heatmap}}</div>
    <div class="heatmap-key"><span>{{lessLabel}}</span>{{legend}}<span>{{moreLabel}}</span></div>
  </section>
  <p class="field-help">{{explanation}}</p>
</template>
