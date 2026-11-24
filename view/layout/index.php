<?php
if (!defined('PROJECT_ROOT')) {
    http_response_code(404);
    exit();
}
$assets = require PROJECT_ROOT . '/controller/config/assets.php';
?>
<!doctype html>
<html lang="<?= $lang ?>">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#FFF9F5">
  <meta name="description" content="MyRemarkable Mind — Your private space for ideas, diagrams and habits.">
  <title>MyRemarkable Mind</title>
  <link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
  <?php foreach ($assets['styles'] as $path): ?>
    <link rel="stylesheet" href="<?= $path ?>?v=<?= filemtime(PROJECT_ROOT . '/' . $path) ?>">
  <?php endforeach; ?>
  <?php foreach ($assets['scripts'] as $path): ?>
    <script src="<?= $path ?>?v=<?= filemtime(PROJECT_ROOT . '/' . $path) ?>" defer></script>
  <?php endforeach; ?>
</head>
<body>
  <div id="app"><div class="boot"><span class="boot-flower">✳</span><span>MyRemarkable Mind</span></div></div>
  <div id="toast" role="status" aria-live="polite"></div>
  <dialog id="modal"></dialog>
  <?php foreach ($assets['templates'] as $path) {
      require PROJECT_ROOT . '/' . $path;
  } ?>
  <script type="application/json" id="request-routes"><?= json_encode(
      require PROJECT_ROOT . '/controller/routes.php',
      JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT,
  ) ?></script>
  <noscript><p>Enable JavaScript to use MyRemarkable Mind. / Activa JavaScript para usar MyRemarkable Mind.</p></noscript>
</body>
</html>
