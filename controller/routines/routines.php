<?php
declare(strict_types=1);

final class RoutinesController
{
    public function __construct(private DB $db, private Auth $auth, private array $user) {}

    public function handle(string $action, array $data): mixed
    {
        $model = new RoutinesModel($this->db, $this->user);
        return match ($action) {
            'saveRoutine' => ['id' => $model->saveRoutine($data)],
            default => fail('error_not_found', 404),
        };
    }
}
