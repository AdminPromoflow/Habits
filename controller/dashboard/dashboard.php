<?php
declare(strict_types=1);

final class DashboardController
{
    public function __construct(private DB $db, private Auth $auth, private ?array $user) {}

    public function handle(string $action, array $data): mixed
    {
        if ($action === 'bootstrap') {
            return $this->bootstrap();
        }
        if ($action === 'timezones') {
            return DateTimeZone::listIdentifiers();
        }
        if ($action === 'readNotifications') {
            $this->db->run('UPDATE notifications SET is_read=1 WHERE user_id=?', [
                $this->user['id'],
            ]);
            return null;
        }
        return (new DashboardModel($this->db, $this->user))->data();
    }

    private function bootstrap(): array
    {
        $language = $this->user['language'] ?? ($_COOKIE['rutina_language'] ?? 'en');
        if (!in_array($language, ['en', 'es'], true)) {
            $language = 'en';
        }
        $result = [
            'user' => $this->user,
            'language' => $language,
            'translations' => [
                'en' => require PROJECT_ROOT . '/translations/en.php',
                'es' => require PROJECT_ROOT . '/translations/es.php',
            ],
            'csrf' => $_SESSION['csrf'],
            'registration_enabled' =>
                ($this->db->one(
                    "SELECT setting_value FROM platform_settings WHERE setting_key='registration_enabled'",
                )['setting_value'] ??
                    '1') ===
                '1',
            'platform_name' =>
                $this->db->one(
                    "SELECT setting_value FROM platform_settings WHERE setting_key='platform_name'",
                )['setting_value'] ?? 'MyRemarkable Mind',
        ];
        if ($this->user) {
            $result['data'] = (new DashboardModel($this->db, $this->user))->data();
        }
        return $result;
    }
}
