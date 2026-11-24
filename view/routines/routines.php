<?php if (!defined('PROJECT_ROOT')) {
    http_response_code(404);
    exit();
} ?>
<template id="view-routines">
  <button class="text-btn back-btn" data-view="habits">{{backIcon}}{{backLabel}}</button>{{heading}}
  <div class="routine-toolbar">
    {{dateControls}}<span class="badge mint">{{startDate}} – {{endDate}}</span>
  </div>
  <p class="muted">{{note}}</p>
  <div class="routine-board">{{board}}</div>
</template>
