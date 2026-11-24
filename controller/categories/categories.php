<?php
declare(strict_types=1);

final class CategoriesController
{
    public function __construct(private DB $db, private Auth $auth, private array $user) {}

    public function handle(string $action, array $data): mixed
    {
        $model = new CategoriesModel($this->db, $this->user);
        return match ($action) {
            'saveCategory' => ['id' => $model->saveCategory($data)],
            'joinCategory' => $model->joinCategory($data),
            'leaveCategory' => $model->leaveCategory($data),
            'deleteCategory' => $model->deleteCategory($data),
            'requestCategory' => $model->requestCategory($data),
            default => fail('error_not_found', 404),
        };
    }
}
