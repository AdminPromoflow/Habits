<?php if (!defined('PROJECT_ROOT')) {
    http_response_code(404);
    exit();
} ?>
<template id="view-sharing">
  {{heading}}
  <div class="tabs" role="tablist">{{tabs}}</div>
  <div class="filter-bar wrap">
    <label class="search-field"
      >{{searchIcon}}<input
        id="share-search"
        value="{{searchValue}}"
        placeholder="{{searchPlaceholder}}"
        aria-label="{{searchLabel}}" /></label
    >
  </div>
  <div class="sharing-workspace">
    <aside class="share-people" aria-label="{{peopleLabel}}">
      <h2>{{peopleLabel}}</h2>
      <div class="share-people-list">{{people}}</div>
    </aside>
    <section class="share-person-content" aria-live="polite">
      <div class="share-person-heading">{{detailsHeading}}</div>
      <div class="share-grid">{{cards}}</div>
    </section>
  </div>
</template>
