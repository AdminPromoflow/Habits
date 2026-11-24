<?php
declare(strict_types=1);

final class MindSpacesController
{
    public function __construct(private DB $db, private Auth $auth, private array $user) {}
    public function handle(string $action, array $data): array
    {
        $model = new MindSpacesModel($this->db, $this->user);
        return match ($action) {
            'mindspace' => $model->get(),
            'createMindSpaceItem' => $model->create($data),
            'saveMindSpaceItem' => $model->save($data),
            'addMindSpaceHabit' => $model->addHabit($data),
            'moveMindSpaceItem' => $model->move($data),
        };
    }
}
