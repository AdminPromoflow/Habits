<?php
declare(strict_types=1);

final class SharingController
{
    public function __construct(private DB $db, private Auth $auth, private array $user) {}

    public function handle(string $action, array $data): mixed
    {
        $model = new SharingModel($this->db, $this->user);
        return match ($action) {
            'group' => $model->group($data),
            'share' => $model->share($data),
            'shareMindSpace' => (new MindSpaceShares($this->db, $this->user))->invite($data),
            'respondMindSpaceShare' => (new MindSpaceShares($this->db, $this->user))->respond($data),
            'revokeMindSpaceShare' => (new MindSpaceShares($this->db, $this->user))->revoke($data),
            'leaveMindSpaceShare' => (new MindSpaceShares($this->db, $this->user))->revoke($data, true),
            'sharedMindSpace' => (new MindSpaceShares($this->db, $this->user))->preview($data),
            'changeMindSpaceShare' => (new MindSpaceShares($this->db, $this->user))->change($data),
            'sharedMindSpaceAction' => (new MindSpaceShares($this->db, $this->user))->action($data),
            'respond' => $model->respond($data),
            'changeShare' => $model->changeShare($data),
            'leaveShare' => $model->leaveShare($data),
            'consent' => $model->consent($data),
            default => fail('error_not_found', 404),
        };
    }
}
