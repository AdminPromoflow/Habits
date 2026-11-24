<?php
declare(strict_types=1);
require_once __DIR__ . '/controller/security/bootstrap.php';
securityHeaders();
$lang = in_array($_COOKIE['rutina_language'] ?? 'en', ['en', 'es'], true)
    ? $_COOKIE['rutina_language'] ?? 'en'
    : 'en';
require PROJECT_ROOT . '/view/layout/index.php';
