<?php
declare(strict_types=1);

final class ProfileModel extends BaseModel
{
    public function settings(array $d): void
    {
        $language = Validate::choice($d['language'] ?? $this->user['language'], ['en', 'es']);
        $timezone = Validate::choice(
            $d['timezone'] ?? $this->user['timezone'],
            DateTimeZone::listIdentifiers(),
        );
        $theme = Validate::choice($d['theme'] ?? $this->user['theme'], ['light', 'dark']);
        $notifications = array_key_exists('notifications_enabled', $d)
            ? (int) (bool) $d['notifications_enabled']
            : (int) $this->user['notifications_enabled'];
        $this->db->run(
            'UPDATE user_settings SET language=?,timezone=?,theme=?,notifications_enabled=? WHERE user_id=?',
            [$language, $timezone, $theme, $notifications, $this->uid()],
        );
        if (isset($d['name'])) {
            $this->db->run('UPDATE users SET name=? WHERE id=?', [
                Validate::text($d, 'name', 100),
                $this->uid(),
            ]);
        }
        languageCookie($language);
    }

    public function password(array $d): void
    {
        $u = $this->db->one('SELECT password_hash FROM users WHERE id=? FOR UPDATE', [
            $this->uid(),
        ]);
        if (!password_verify(Validate::text($d, 'current_password', 72), $u['password_hash'])) {
            fail('error_login', 403);
        }
        $password = Validate::password($d['password'] ?? null);
        $this->db->run('UPDATE users SET password_hash=?,auth_version=auth_version+1 WHERE id=?', [
            password_hash($password, PASSWORD_DEFAULT),
            $this->uid(),
        ]);
        $_SESSION['auth_version']++;
        session_regenerate_id(true);
    }

    public function weight(array $d): void
    {
        $date = Validate::date($d['date'] ?? $this->today());
        if ($date > $this->today()) {
            fail('error_date');
        }
        $weight = Validate::number($d['weight_kg'] ?? null, 1, 500);
        $this->db->run(
            'INSERT INTO wellness_entries(user_id,recorded_on,weight_kg) VALUES (?,?,?) ON DUPLICATE KEY UPDATE weight_kg=VALUES(weight_kg)',
            [$this->uid(), $date, $weight],
        );
    }
}
