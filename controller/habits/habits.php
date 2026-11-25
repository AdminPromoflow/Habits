<?php
declare(strict_types=1);

final class HabitsController
{
    public function __construct(private DB $db, private Auth $auth, private array $user) {}

    public function handle(string $action, array $data): mixed
    {
        $model = new Habits($this->db, $this->user);
        return match ($action) {
            'saveHabit' => ['id' => $model->saveHabit($data)],
            'archiveHabit' => $model->archiveHabit($data),
            'deleteHabit' => $model->deleteHabit($data),
            'complete' => $model->complete($data),
            default => fail('error_not_found', 404),
        };
    }
}
