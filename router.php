<?php
// Router for the PHP development server. Apache uses .htaccess.
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '/');
if ($path === '/' || $path === '/index.php') {
    require __DIR__ . '/index.php';
    return true;
}
if ($path === '/api.php') {
    require __DIR__ . '/api.php';
    return true;
}
if (
    preg_match(
        '~^/controller/(dashboard|users|habits|calendar|categories|routines|sharing|profile|admin|diagrams|mindspaces)/index\.php$~D',
        $path,
    )
) {
    require __DIR__ . $path;
    return true;
}
if (
    preg_match(
        '~^/(?:assets|view)/(?:[a-zA-Z0-9_-]+/)*[a-zA-Z0-9_.-]+\.(css|js|svg|woff2)$~D',
        $path,
    ) &&
    is_file(__DIR__ . $path)
) {
    return false;
}
http_response_code(404);
echo '404';
