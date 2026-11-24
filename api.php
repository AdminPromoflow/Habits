<?php
declare(strict_types=1);
// Compatibility endpoint for existing clients. New views use controller/<module>/index.php.
require_once __DIR__ . '/controller/security/bootstrap.php';
Request::dispatch();
