<?php
declare(strict_types=1);

// Exercise the JSON boundary without a database or an authenticated session.
define('PROJECT_ROOT', dirname(__DIR__));
require PROJECT_ROOT . '/controller/security/request.php';
function securityHeaders(): void {}
function beginSession(): void {}
function database(): never { throw $GLOBALS['databaseError']; }

$_SERVER['REQUEST_METHOD'] = 'GET';
$_GET['action'] = 'bootstrap';
$log = tempnam(sys_get_temp_dir(), 'mrm-request-errors-');
ini_set('error_log', $log);
$checks = 0;
try {
    foreach ([
        ['23000', 1062, 409, 'error_duplicate'],
        ['23000', 1451, 409, 'error_duplicate'],
        ['23000', 1452, 409, 'error_duplicate'],
        ['23000', 4025, 503, 'error_database'], // MariaDB CHECK constraint.
        ['HY000', 3819, 503, 'error_database'], // MySQL CHECK constraint.
        ['23000', 1048, 503, 'error_database'], // Unexpected NULL.
        ['42S22', 1054, 503, 'error_database'], // Missing migrated column.
        ['23000', null, 503, 'error_database'],
    ] as [$state, $code, $status, $key]) {
        $detail = 'Private database detail ' . ($code ?? 'unknown');
        $databaseError = new PDOException($detail, (int) $state);
        // PDO exposes SQLSTATE as a string, including alphanumeric states.
        (new ReflectionProperty(Exception::class, 'code'))->setValue($databaseError, $state);
        $databaseError->errorInfo = [$state, $code, $detail];
        ob_start();
        Request::dispatch();
        $body = ob_get_clean();
        if (http_response_code() !== $status || json_decode($body, true) !== ['ok' => false, 'error' => $key]) {
            throw new RuntimeException('Incorrect response for database error ' . ($code ?? 'unknown'));
        }
        if ($key === 'error_database' && !str_contains(file_get_contents($log), $detail)) {
            throw new RuntimeException('Unexpected database failure was not logged.');
        }
        $checks++;
    }
} finally {
    unlink($log);
}
echo "$checks database error response checks passed.\n";
