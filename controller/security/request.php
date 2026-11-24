<?php
declare(strict_types=1);

/** Shared HTTP, CSRF, authentication and JSON boundary for every AJAX endpoint. */
final class Request
{
    private const READ_ACTIONS = ['bootstrap', 'data', 'group', 'admin', 'timezones', 'diagrams'];
    private const PUBLIC_ACTIONS = [
        'bootstrap',
        'login',
        'register',
        'setup',
        'forgotPassword',
        'resetPassword',
        'logout',
        'language',
    ];

    public static function dispatch(?string $expectedModule = null): void
    {
        securityHeaders();
        header('Content-Type: application/json; charset=utf-8');
        beginSession();

        try {
            $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
            if (!in_array($method, ['GET', 'POST'], true)) {
                fail('error_method', 405);
            }
            $action = $_GET['action'] ?? 'bootstrap';
            if (!is_string($action)) {
                fail('error_validation');
            }
            $routes = require PROJECT_ROOT . '/controller/routes.php';
            $module = $routes[$action] ?? null;
            if (!$module || ($expectedModule !== null && $module !== $expectedModule)) {
                fail('error_not_found', 404);
            }
            if (($method === 'GET') !== in_array($action, self::READ_ACTIONS, true)) {
                fail('error_method', 405);
            }

            $data = $method === 'POST' ? self::body($action === 'saveDiagram' ? 3145728 : 100000) : $_GET;
            $db = database();
            $auth = new Auth($db);
            $user = in_array($action, self::PUBLIC_ACTIONS, true)
                ? $auth->user()
                : $auth->requireUser();
            if ($module === 'admin' && !in_array('admin', $user['roles'] ?? [], true)) {
                fail('error_forbidden', 403);
            }

            if ($action === 'share') {
                $auth->rate('share:' . $user['id'], 20, 3600);
            }
            if ($action === 'requestCategory') {
                $auth->rate('request:' . $user['id'], 10, 3600);
            }
            if ($action === 'password') {
                $auth->rate('password:' . $user['id'], 8, 3600);
            }

            $controllers = [
                'dashboard' => DashboardController::class,
                'users' => AuthController::class,
                'habits' => HabitsController::class,
                'categories' => CategoriesController::class,
                'routines' => RoutinesController::class,
                'sharing' => SharingController::class,
                'profile' => ProfileController::class,
                'admin' => AdminController::class,
                'diagrams' => DiagramsController::class,
            ];
            $controllerClass = $controllers[$module];
            $controller = new $controllerClass($db, $auth, $user);
            $operation = fn() => $controller->handle($action, $data);
            // Authentication manages its own transactions and session rotation.
            $result =
                $method === 'POST' && $module !== 'users'
                    ? $db->transaction($operation)
                    : $operation();
            echo json_encode(
                ['ok' => true, 'result' => $result],
                JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE,
            );
        } catch (AppError $error) {
            self::error($error->key, $error->status);
        } catch (JsonException $error) {
            self::error('error_validation', 422);
        } catch (PDOException $error) {
            // SQLSTATE 23000 also covers CHECK/NOT NULL failures, including an
            // outdated schema rejecting valid empty ideas. Only known unique
            // and foreign-key conflicts mean an item already exists/is in use.
            $duplicate = $error->getCode() === '23000'
                && in_array((int) ($error->errorInfo[1] ?? 0), [1062, 1451, 1452], true);
            if (!$duplicate) {
                error_log('MyRemarkable Mind database error: ' . $error->getMessage());
            }
            self::error($duplicate ? 'error_duplicate' : 'error_database', $duplicate ? 409 : 503);
        } catch (Throwable $error) {
            error_log('MyRemarkable Mind: ' . $error);
            self::error('error_server', 500);
        }
    }

    private static function body(int $limit = 100000): array
    {
        if (!str_starts_with(strtolower($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) {
            fail('error_validation', 415);
        }
        $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if (!is_string($token) || !hash_equals($_SESSION['csrf'], $token)) {
            fail('error_csrf', 419);
        }
        if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > $limit) {
            fail('error_validation', 413);
        }
        $raw = file_get_contents('php://input', false, null, 0, $limit + 1);
        if (strlen($raw) > $limit) {
            fail('error_validation', 413);
        }
        $data = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
        if (!is_array($data)) {
            fail('error_validation');
        }
        return $data;
    }

    private static function error(string $key, int $status): void
    {
        http_response_code($status);
        echo json_encode(['ok' => false, 'error' => $key]);
    }
}
