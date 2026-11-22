<?php
// Copy to local.php. Use a dedicated MySQL user and HTTPS in production.
return [
    'db_host' => '127.0.0.1',
    'db_port' => 3306,
    'db_name' => 'mi_rutina',
    'db_user' => 'mi_rutina',
    'db_password' => '',
    'db_socket' => '',
    'app_url' => 'http://localhost/Habits',
    'secure_cookies' => false, // MUST be true on HTTPS / Hostinger.
    'session_path' => __DIR__ . '/../storage/sessions',
];
