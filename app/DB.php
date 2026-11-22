<?php
declare(strict_types=1);
final class DB {
    public PDO $pdo;
    public function __construct(array $c) {
        $host = !empty($c['db_socket']) ? 'unix_socket='.$c['db_socket'] : 'host='.$c['db_host'].';port='.$c['db_port'];
        $this->pdo = new PDO('mysql:'.$host.';dbname='.$c['db_name'].';charset=utf8mb4', $c['db_user'], $c['db_password'], [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false]);
        $this->pdo->exec("SET time_zone = '+00:00'");
    }
    public function run(string $sql, array $params = []): PDOStatement {
        $st = $this->pdo->prepare($sql); $st->execute($params); return $st;
    }
    public function one(string $sql, array $params = []): ?array { return $this->run($sql,$params)->fetch() ?: null; }
    public function all(string $sql, array $params = []): array { return $this->run($sql,$params)->fetchAll(); }
    public function id(): int { return (int)$this->pdo->lastInsertId(); }
    public function transaction(callable $fn): mixed {
        $this->pdo->beginTransaction();
        try { $r = $fn(); $this->pdo->commit(); return $r; }
        catch (Throwable $e) { if ($this->pdo->inTransaction()) $this->pdo->rollBack(); throw $e; }
    }
}
