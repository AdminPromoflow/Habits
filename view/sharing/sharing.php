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
    >{{permissionFilter}}{{categoryFilter}}{{ownerFilter}}{{statusFilter}}
  </div>
  <div class="share-grid">{{cards}}</div>
</template>
