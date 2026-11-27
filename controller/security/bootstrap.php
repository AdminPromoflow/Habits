<?php
declare(strict_types=1);

define('PROJECT_ROOT', dirname(__DIR__, 2));

spl_autoload_register(static function (string $class): void {
    $classes = [
        'BaseModel' => 'model/base.php',
        'AccessPolicy' => 'controller/security/access.php',
        'Habits' => 'model/habits/habits.php',
        'Schedule' => 'model/calendar/schedule.php',
        'CalendarModel' => 'model/calendar/calendar.php',
        'GoalsModel' => 'model/goals/goals.php',
        'GoalsController' => 'controller/goals/goals.php',
        'PlannerCardSync' => 'model/calendar/card-sync.php',
        'CalendarController' => 'controller/calendar/calendar.php',
        'CategoriesModel' => 'model/categories/categories.php',
        'RoutinesModel' => 'model/routines/routines.php',
        'SharingModel' => 'model/sharing/sharing.php',
        'MindSpaceShares' => 'model/sharing/mindspace-shares.php',
        'ProfileModel' => 'model/users/profile.php',
        'AdminModel' => 'model/admin/admin.php',
        'DashboardModel' => 'model/dashboard/dashboard.php',
        'DB' => 'controller/config/database.php',
        'Auth' => 'model/users/auth.php',
        'Validate' => 'controller/security/validation.php',
        'AppError' => 'controller/security/error.php',
        'Mailer' => 'controller/emails/mailer.php',
        'DiagramsModel' => 'model/diagrams/diagrams.php',
        'MindSpacesModel' => 'model/mindspaces/mindspaces.php',
        'MindSpacesController' => 'controller/mindspaces/mindspaces.php',
        'Request' => 'controller/security/request.php',
        'DashboardController' => 'controller/dashboard/dashboard.php',
        'AuthController' => 'controller/users/users.php',
        'HabitsController' => 'controller/habits/habits.php',
        'CategoriesController' => 'controller/categories/categories.php',
        'RoutinesController' => 'controller/routines/routines.php',
        'SharingController' => 'controller/sharing/sharing.php',
        'ProfileController' => 'controller/profile/profile.php',
        'AdminController' => 'controller/admin/admin.php',
        'DiagramsController' => 'controller/diagrams/diagrams.php',
    ];
    if (isset($classes[$class])) {
        require_once PROJECT_ROOT . '/' . $classes[$class];
    }
});
date_default_timezone_set('UTC');
$local = is_file(PROJECT_ROOT . '/config/local.php')
    ? require PROJECT_ROOT . '/config/local.php'
    : [];
$config = array_replace(require PROJECT_ROOT . '/config/example.php', $local);
foreach (
    [
        'db_host',
        'db_port',
        'db_name',
        'db_user',
        'db_password',
        'db_socket',
        'app_url',
        'session_path',
        'mail_transport',
        'mail_from',
    ]
    as $key
) {
    $value = getenv('RUTINA_' . strtoupper($key));
    if ($value !== false) {
        $config[$key] = $value;
    }
}
if (getenv('RUTINA_SECURE_COOKIES') !== false) {
    $config['secure_cookies'] = getenv('RUTINA_SECURE_COOKIES') === '1';
}

function config(?string $key = null): mixed
{
    global $config;
    return $key === null ? $config : $config[$key] ?? null;
}
function database(): DB
{
    static $db;
    return $db ??= new DB(config());
}
function beginSession(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $path = config('session_path');
    if (!is_dir($path)) {
        mkdir($path, 0700, true);
    }
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.gc_maxlifetime', '86400');
    session_save_path($path);
    session_name('mi_rutina_session');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => (bool) config('secure_cookies'),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
    $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
}
function securityHeaders(): void
{
    header('Cache-Control: no-store, private');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: same-origin');
    header(
        "Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
    if (config('secure_cookies')) {
        header('Strict-Transport-Security: max-age=31536000');
    }
}
function languageCookie(string $language): void
{
    setcookie('rutina_language', $language, [
        'expires' => time() + 31536000,
        'path' => '/',
        'secure' => (bool) config('secure_cookies'),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    $_COOKIE['rutina_language'] = $language;
}
function fail(string $key, int $status = 422): never
{
    throw new AppError($key, $status);
}
