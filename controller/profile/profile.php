<?php
declare(strict_types=1);

final class ProfileController
{
    public function __construct(private DB $db, private Auth $auth, private array $user) {}

    public function handle(string $action, array $data): mixed
    {
        $model = new ProfileModel($this->db, $this->user);
        return match ($action) {
            'settings' => $model->settings($data),
            'password' => $model->password($data),
            'weight' => $model->weight($data),
            default => fail('error_not_found', 404),
        };
    }
}
