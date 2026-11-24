<?php
declare(strict_types=1);

final class AdminModel extends BaseModel
{
    public function adminData(): array
    {
        $this->admin();
        return [
            'users' => $this->db->all(
                'SELECT u.id,u.name,u.email,u.status,u.created_at,GROUP_CONCAT(r.role ORDER BY r.role) AS roles FROM users u LEFT JOIN user_roles r ON r.user_id=u.id GROUP BY u.id ORDER BY u.id',
            ),
            'categories' => $this->db->all(
                'SELECT id,name,translation_key,description,icon,color FROM habit_categories WHERE owner_user_id IS NULL ORDER BY id',
            ),
            'requests' => $this->db->all(
                'SELECT r.*,u.name AS requester FROM category_requests r JOIN users u ON u.id=r.user_id ORDER BY r.id DESC',
            ),
            'templates' => $this->db->all('SELECT * FROM habit_templates ORDER BY id'),
            'settings' => array_column(
                $this->db->all('SELECT * FROM platform_settings'),
                'setting_value',
                'setting_key',
            ),
            // Aggregate counts only: no private habit titles, descriptions, personal categories or user progress.
            'statistics' => [
                'users' => (int) $this->db->one('SELECT COUNT(*) AS n FROM users')['n'],
                'habits' => (int) $this->db->one('SELECT COUNT(*) AS n FROM habits')['n'],
                'completions' => (int) $this->db->one(
                    'SELECT COUNT(*) AS n FROM habit_completions WHERE amount>=goal_at_time',
                )['n'],
                'collaborations' => (int) $this->db->one(
                    "SELECT COUNT(*) AS n FROM habit_shares WHERE status='accepted'",
                )['n'],
                'pending' => (int) $this->db->one(
                    "SELECT COUNT(*) AS n FROM category_requests WHERE status='pending'",
                )['n'],
                'weekly' => $this->db->all(
                    'SELECT DATE(created_at) AS date,COUNT(*) AS total FROM users WHERE created_at>=UTC_TIMESTAMP()-INTERVAL 30 DAY GROUP BY DATE(created_at)',
                ),
            ],
        ];
    }

    public function manageUser(array $d): void
    {
        $this->admin();
        $id = (int) ($d['id'] ?? 0);
        // Serialize admin mutations so concurrent demotions cannot remove the last administrator.
        $admins = $this->db->all(
            "SELECT u.id FROM users u JOIN user_roles r ON r.user_id=u.id WHERE r.role='admin' AND u.status='active' FOR UPDATE",
        );
        $u = $this->db->one('SELECT id FROM users WHERE id=? FOR UPDATE', [$id]);
        if (!$u) {
            fail('error_not_found', 404);
        }
        $status = Validate::choice($d['status'] ?? 'active', ['active', 'suspended']);
        $admin = !empty($d['admin']);
        if ($id === $this->uid() && ($status !== 'active' || !$admin)) {
            fail('error_self_admin');
        }
        if (
            count($admins) === 1 &&
            (int) $admins[0]['id'] === $id &&
            (!$admin || $status !== 'active')
        ) {
            fail('error_self_admin');
        }
        $this->db->run('UPDATE users SET status=?,auth_version=auth_version+1 WHERE id=?', [
            $status,
            $id,
        ]);
        if ($admin) {
            $this->db->run("INSERT IGNORE INTO user_roles(user_id,role) VALUES (?,'admin')", [$id]);
        } else {
            $this->db->run("DELETE FROM user_roles WHERE user_id=? AND role='admin'", [$id]);
        }
        $this->db->run("INSERT IGNORE INTO user_roles(user_id,role) VALUES (?,'user')", [$id]);
        if ($id === $this->uid()) {
            $_SESSION['auth_version']++;
        }
    }

    public function saveTemplate(array $d): void
    {
        $this->admin();
        $id = (int) ($d['id'] ?? 0);
        $category = $this->category((int) ($d['category_id'] ?? 0));
        if ($category['owner_user_id'] !== null) {
            fail('error_validation');
        }
        $values = [
            $category['id'],
            Validate::text($d, 'name'),
            Validate::text($d, 'description', 3000, false),
            Validate::number($d['goal'] ?? 1, 0.01),
            Validate::text($d, 'unit', 40, false),
            Validate::days($d['schedule_days'] ?? [1, 2, 3, 4, 5, 6, 7]),
            (int) !empty($d['active']),
        ];
        if ($id) {
            $this->db->run(
                'UPDATE habit_templates SET category_id=?,name=?,description=?,goal=?,unit=?,schedule_days=?,active=?,translation_key=NULL WHERE id=?',
                array_merge($values, [$id]),
            );
        } else {
            $this->db->run(
                'INSERT INTO habit_templates(category_id,name,description,goal,unit,schedule_days,active) VALUES (?,?,?,?,?,?,?)',
                $values,
            );
        }
    }

    public function platform(array $d): void
    {
        $this->admin();
        $this->db->run(
            "UPDATE platform_settings SET setting_value=? WHERE setting_key='registration_enabled'",
            [!empty($d['registration_enabled']) ? '1' : '0'],
        );
        $this->db->run(
            "UPDATE platform_settings SET setting_value=? WHERE setting_key='platform_name'",
            [Validate::text($d, 'platform_name', 60)],
        );
    }
}
