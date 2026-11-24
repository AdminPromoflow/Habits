<?php
declare(strict_types=1);

final class AuthController
{
    public function __construct(private DB $db, private Auth $auth, private ?array $user) {}

    public function handle(string $action, array $data): array
    {
        if ($action === 'language') {
            $language = Validate::choice($data['language'] ?? '', ['en', 'es']);
            if ($this->user) {
                (new ProfileModel($this->db, $this->user))->settings(['language' => $language]);
            } else {
                languageCookie($language);
            }
        } elseif ($action === 'logout') {
            $this->auth->logout();
        } else {
            // Request already restricts the action to this module's public allowlist.
            $this->auth->$action($data);
        }
        return ['csrf' => $_SESSION['csrf']];
    }
}
