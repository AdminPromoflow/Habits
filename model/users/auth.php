<?php
declare(strict_types=1);
final class Auth
{
    public function __construct(private DB $db) {}
    public function user(): ?array
    {
        if (empty($_SESSION['user_id'])) {
            return null;
        }
        if (($_SESSION['seen_at'] ?? 0) < time() - 86400) {
            $this->logout();
            return null;
        }
        $u = $this->db->one(
            'SELECT u.id,u.name,u.email,u.status,u.auth_version,s.language,s.timezone,s.theme,s.notifications_enabled FROM users u JOIN user_settings s ON s.user_id=u.id WHERE u.id=?',
            [$_SESSION['user_id']],
        );
        if (
            !$u ||
            $u['status'] !== 'active' ||
            $u['auth_version'] !== ($_SESSION['auth_version'] ?? null)
        ) {
            $this->logout();
            return null;
        }
        $_SESSION['seen_at'] = time();
        $u['roles'] = array_column(
            $this->db->all('SELECT role FROM user_roles WHERE user_id=?', [$u['id']]),
            'role',
        );
        unset($u['auth_version']);
        return $u;
    }
    public function requireUser(): array
    {
        return $this->user() ?? fail('error_auth', 401);
    }
    public function rate(string $key, int $limit, int $seconds = 900): void
    {
        $bucket = hash('sha256', $key);
        $this->db->run(
            'INSERT INTO rate_limits(bucket,attempts,expires_at) VALUES (?,1,?) ON DUPLICATE KEY UPDATE attempts=IF(expires_at<UTC_TIMESTAMP(),1,attempts+1),expires_at=IF(expires_at<UTC_TIMESTAMP(),VALUES(expires_at),expires_at)',
            [$bucket, gmdate('Y-m-d H:i:s', time() + $seconds)],
        );
        $r = $this->db->one('SELECT attempts FROM rate_limits WHERE bucket=?', [$bucket]);
        if ((int) $r['attempts'] > $limit) {
            fail('error_rate', 429);
        }
    }
    private function signIn(array $u): void
    {
        session_regenerate_id(true);
        $_SESSION = [
            'user_id' => (int) $u['id'],
            'auth_version' => (int) $u['auth_version'],
            'csrf' => bin2hex(random_bytes(32)),
            'seen_at' => time(),
        ];
        $s = $this->db->one('SELECT language FROM user_settings WHERE user_id=?', [$u['id']]);
        languageCookie($s['language'] ?? 'en');
    }
    public function login(array $d): void
    {
        $email = Validate::email($d['email'] ?? null);
        $this->rate('login-ip:' . ($_SERVER['REMOTE_ADDR'] ?? 'cli'), 50);
        $this->rate('login-email:' . $email, 12);
        $u = $this->db->one('SELECT * FROM users WHERE email=?', [$email]);
        $hash =
            $u['password_hash'] ?? '$2y$12$vbxSzvPax3GhGiG6YcL1HeEGaD7E1xqiv5iMh1vo66fK3f0OWFz7K';
        $password = Validate::text($d, 'password', 72);
        if (
            !password_verify($password, $hash) ||
            !$u ||
            $u['status'] !== 'active' ||
            $u['setup_token_hash']
        ) {
            fail('error_login', 401);
        }
        if (password_needs_rehash($hash, PASSWORD_DEFAULT)) {
            $this->db->run('UPDATE users SET password_hash=? WHERE id=?', [
                password_hash($password, PASSWORD_DEFAULT),
                $u['id'],
            ]);
        }
        $this->db->run('DELETE FROM rate_limits WHERE bucket=?', [
            hash('sha256', 'login-email:' . $email),
        ]);
        $this->signIn($u);
    }
    public function register(array $d): void
    {
        $this->rate('register:' . ($_SERVER['REMOTE_ADDR'] ?? 'cli'), 8, 3600);
        if (
            ($this->db->one(
                "SELECT setting_value FROM platform_settings WHERE setting_key='registration_enabled'",
            )['setting_value'] ??
                '1') !==
            '1'
        ) {
            fail('error_registration', 403);
        }
        $email = Validate::email($d['email'] ?? null);
        $name = Validate::text($d, 'name', 100);
        $password = Validate::password($d['password'] ?? null);
        $language = Validate::choice($d['language'] ?? 'en', ['en', 'es']);
        if ($email === 'aleinarossui@gmail.com') {
            fail('error_registration');
        }
        try {
            $id = $this->db->transaction(function () use ($name, $email, $password, $language) {
                $this->db->run('INSERT INTO users(name,email,password_hash) VALUES (?,?,?)', [
                    $name,
                    $email,
                    password_hash($password, PASSWORD_DEFAULT),
                ]);
                $id = $this->db->id();
                $this->db->run("INSERT INTO user_roles(user_id,role) VALUES (?,'user')", [$id]);
                $this->db->run('INSERT INTO user_settings(user_id,language) VALUES (?,?)', [
                    $id,
                    $language,
                ]);
                return $id;
            });
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                fail('error_registration');
            }
            throw $e;
        }
        $this->signIn($this->db->one('SELECT * FROM users WHERE id=?', [$id]));
    }
    public function setup(array $d): void
    {
        $this->rate('setup:' . ($_SERVER['REMOTE_ADDR'] ?? 'cli'), 10, 3600);
        $token = Validate::text($d, 'token', 128);
        $password = Validate::password($d['password'] ?? null);
        $u = $this->db->transaction(function () use ($token, $password) {
            $u = $this->db->one(
                "SELECT * FROM users WHERE setup_token_hash=? AND setup_expires_at>UTC_TIMESTAMP() AND status='active' FOR UPDATE",
                [hash('sha256', $token)],
            );
            if (!$u) {
                fail('error_setup', 403);
            }
            $this->db->run(
                'UPDATE users SET password_hash=?,setup_token_hash=NULL,setup_expires_at=NULL,auth_version=auth_version+1 WHERE id=?',
                [password_hash($password, PASSWORD_DEFAULT), $u['id']],
            );
            $u['auth_version']++;
            return $u;
        });
        $this->signIn($u);
    }
    public function forgotPassword(array $d): void
    {
        $email = Validate::email($d['email'] ?? null);
        $language = Validate::choice($d['language'] ?? 'en', ['en', 'es']);
        $this->rate('recovery-ip:' . ($_SERVER['REMOTE_ADDR'] ?? 'cli'), 20, 3600);
        $mailer = new Mailer();
        if (!$mailer->ready()) {
            fail('error_mail_unavailable', 503);
        }
        // Apply the same limits and response to registered and unknown addresses.
        try {
            $this->rate('recovery-email:' . $email, 3, 3600);
        } catch (AppError $e) {
            if ($e->key === 'error_rate') {
                return;
            }
            throw $e;
        }
        $this->rate('recovery-global-minute', 8, 60);
        $this->rate('recovery-global-day', 90, 86400);
        $this->db->run('DELETE FROM password_resets WHERE expires_at<=UTC_TIMESTAMP()');
        $u = $this->db->one("SELECT id,auth_version FROM users WHERE email=? AND status='active'", [
            $email,
        ]);
        if (!$u) {
            return;
        }
        $token = bin2hex(random_bytes(32));
        $hash = hash('sha256', $token);
        $this->db->run(
            'INSERT INTO password_resets(token_hash,user_id,auth_version,expires_at) VALUES (?,?,?,?)',
            [$hash, $u['id'], $u['auth_version'], gmdate('Y-m-d H:i:s', time() + 1800)],
        );
        try {
            $sent = $mailer->recovery($email, $token, $language);
        } catch (Throwable $e) {
            $sent = false;
        }
        if (!$sent) {
            $this->db->run('DELETE FROM password_resets WHERE token_hash=?', [$hash]);
            error_log('MI RUTINA: password recovery mail was not accepted by the mail transport.');
        }
    }
    public function resetPassword(array $d): void
    {
        $this->rate('reset-ip:' . ($_SERVER['REMOTE_ADDR'] ?? 'cli'), 20, 3600);
        $token = Validate::text($d, 'token', 64);
        if (!preg_match('/^[a-f0-9]{64}$/D', $token)) {
            fail('error_reset', 403);
        }
        $password = Validate::password($d['password'] ?? null);
        $this->db->transaction(function () use ($token, $password) {
            $hash = hash('sha256', $token);
            $r = $this->db->one('SELECT user_id FROM password_resets WHERE token_hash=?', [$hash]);
            if (!$r) {
                fail('error_reset', 403);
            }
            $u = $this->db->one(
                'SELECT id,email,status,auth_version FROM users WHERE id=? FOR UPDATE',
                [$r['user_id']],
            );
            $r = $this->db->one(
                'SELECT auth_version FROM password_resets WHERE token_hash=? AND expires_at>UTC_TIMESTAMP() FOR UPDATE',
                [$hash],
            );
            if (
                !$u ||
                $u['status'] !== 'active' ||
                !$r ||
                (int) $r['auth_version'] !== (int) $u['auth_version']
            ) {
                fail('error_reset', 403);
            }
            $this->db->run(
                'UPDATE users SET password_hash=?,setup_token_hash=NULL,setup_expires_at=NULL,auth_version=auth_version+1 WHERE id=?',
                [password_hash($password, PASSWORD_DEFAULT), $u['id']],
            );
            $this->db->run('DELETE FROM password_resets WHERE user_id=?', [$u['id']]);
            $this->db->run('DELETE FROM rate_limits WHERE bucket=?', [
                hash('sha256', 'login-email:' . $u['email']),
            ]);
        });
        $this->logout();
    }
    public function logout(): void
    {
        $_SESSION = [];
        session_regenerate_id(true);
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
}
