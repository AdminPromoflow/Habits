<?php if (!defined('PROJECT_ROOT')) {
    http_response_code(404);
    exit();
} ?>
<template id="view-categories">
  {{heading}}
  <section class="category-settings-section">
    <div class="section-heading">
      <div>
        <h2>{{chosenTitle}}</h2>
        <p>{{chosenHint}}</p>
      </div>
    </div>
    {{chosenCategories}}
  </section>
  <section class="category-settings-section">
    <div class="section-heading">
      <div>
        <h2>{{availableTitle}}</h2>
        <p>{{availableHint}}</p>
      </div>
    </div>
    {{availableCategories}}
  </section>
  <p class="info-line">{{lockIcon}}{{privacyHint}}</p>
  <section class="card requests-card">
    <h2>{{requestsTitle}}</h2>
    {{requests}}
  </section>
</template>
