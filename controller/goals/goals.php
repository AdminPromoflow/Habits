<?php
declare(strict_types=1);
final class GoalsController
{
    public function __construct(private DB $db, private Auth $auth, private array $user) {}
    public function handle(string $action, array $data): mixed
    {
        $model = new GoalsModel($this->db,$this->user);
        return match ($action) {
            'saveGoal' => $model->save($data),
            'deleteGoal' => $model->delete($data),
            default => fail('error_not_found',404),
        };
    }
}
