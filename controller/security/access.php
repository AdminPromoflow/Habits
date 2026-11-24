<?php
declare(strict_types=1);

trait AccessPolicy
{
    protected const RANK = ['viewer' => 1, 'participant' => 2, 'editor' => 3, 'owner' => 4];
    protected const VIS = ['none' => 0, 'summary' => 1, 'detailed' => 2];

    public function category(int $id, ?int $owner = null): array
    {
        $c = $this->db->one(
            'SELECT * FROM habit_categories WHERE id=? AND (owner_user_id IS NULL OR owner_user_id=?)',
            [$id, $owner ?? $this->uid()],
        );
        if (!$c) {
            fail('error_not_found', 404);
        }
        return $c;
    }
    // Every access is derived from active server-side grants, never from the UI or collaborator cache.

    public function selectedCategory(int $id, ?int $owner = null): array
    {
        $owner ??= $this->uid();
        $c = $this->category($id, $owner);
        if (
            $c['owner_user_id'] === null &&
            !$this->db->one(
                'SELECT user_id FROM user_categories WHERE user_id=? AND category_id=? FOR UPDATE',
                [$owner, $id],
            )
        ) {
            fail('error_category_not_selected');
        }
        return $c;
    }

    public function grants(array $h, int $uid, bool $lock = false): array
    {
        return $this->db->all(
            "SELECT s.* FROM habit_shares s JOIN users u ON u.id=s.owner_user_id AND u.status='active'
          WHERE s.recipient_user_id=? AND s.owner_user_id=? AND s.status='accepted'
          AND (s.habit_id=? OR (s.category_id=? AND (s.include_future=1 OR EXISTS(SELECT 1 FROM share_habits sh WHERE sh.share_id=s.id AND sh.habit_id=?))))" .
                ($lock ? ' FOR UPDATE' : ''),
            [$uid, $h['owner_user_id'], $h['id'], $h['category_id'], $h['id']],
        );
    }

    public function access(array $h, ?int $uid = null, bool $lock = false): array
    {
        $uid ??= $this->uid();
        if ((int) $h['owner_user_id'] === $uid) {
            return ['permission' => 'owner', 'progress_visibility' => 'detailed'];
        }
        $grants = $this->grants($h, $uid, $lock);
        if (!$grants) {
            fail('error_not_found', 404);
        }
        $permission = 'viewer';
        $visibility = 'none';
        foreach ($grants as $s) {
            if (self::RANK[$s['permission']] > self::RANK[$permission]) {
                $permission = $s['permission'];
            }
            if (self::VIS[$s['progress_visibility']] > self::VIS[$visibility]) {
                $visibility = $s['progress_visibility'];
            }
        }
        return ['permission' => $permission, 'progress_visibility' => $visibility];
    }

    public function habit(int $id, string $need = 'viewer', bool $lock = false): array
    {
        $h = $this->db->one(
            'SELECT h.*,u.name AS owner_name,c.name AS category_name,c.translation_key AS category_key,c.color,c.icon FROM habits h JOIN users u ON u.id=h.owner_user_id JOIN habit_categories c ON c.id=h.category_id WHERE h.id=?' .
                ($lock ? ' FOR UPDATE' : ''),
            [$id],
        );
        if (!$h) {
            fail('error_not_found', 404);
        }
        $a = $this->access($h, null, $lock);
        if (self::RANK[$a['permission']] < self::RANK[$need]) {
            fail('error_forbidden', 403);
        }
        return array_merge($h, $a);
    }
}
