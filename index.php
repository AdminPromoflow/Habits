<?php
require __DIR__.'/app/bootstrap.php';
securityHeaders();
$lang=in_array($_COOKIE['rutina_language']??'en',['en','es'],true)?($_COOKIE['rutina_language']??'en'):'en';
?><!doctype html>
<html lang="<?= $lang ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#FFF9F5">
<meta name="description" content="MI RUTINA — Your private space for habits, routines and thoughtful collaboration.">
<title>MI RUTINA · Your space to grow</title>
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="assets/app.css">
<script src="assets/app.js" defer></script>
</head>
<body>
<div id="app"><div class="boot"><span class="boot-flower">✳</span><span>MI RUTINA</span></div></div>
<div id="toast" role="status" aria-live="polite"></div>
<dialog id="modal"></dialog>
<noscript><p>Enable JavaScript to use MI RUTINA. / Activa JavaScript para usar MI RUTINA.</p></noscript>
</body>
</html>
