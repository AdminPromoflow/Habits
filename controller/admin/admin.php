<?php
declare(strict_types=1);

final class AdminController
{
    public function __construct(private DB $db, private Auth $auth, private array $user) {}

    public function handle(string $action, array $data): mixed
    {
        $model = new AdminModel($this->db, $this->user);
        return match ($action) {
            'admin' => $model->adminData(),
            'reviewCategory' => (new CategoriesModel($this->db, $this->user))->reviewCategory(
                $data,
            ),
            'manageUser' => $model->manageUser($data),
            'saveGlobalCategory' => [
                'id' => (new CategoriesModel($this->db, $this->user))->saveCategory($data, true),
            ],
            'deleteGlobalCategory' => (new CategoriesModel($this->db, $this->user))->deleteCategory(
                $data,
                true,
            ),
            'saveTemplate' => $model->saveTemplate($data),
            'platform' => $model->platform($data),
            default => fail('error_not_found', 404),
        };
    }
}
