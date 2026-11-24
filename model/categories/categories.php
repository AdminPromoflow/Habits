<?php
declare(strict_types=1);

final class CategoriesModel extends BaseModel
{
    public function joinCategory(array $d): void
    {
        $c = $this->category((int) ($d['id'] ?? 0));
        if ($c['owner_user_id'] !== null) {
            fail('error_validation');
        }
        $this->db->run('INSERT IGNORE INTO user_categories(user_id,category_id) VALUES (?,?)', [
            $this->uid(),
            $c['id'],
        ]);
    }

    public function leaveCategory(array $d): void
    {
        $c = $this->category((int) ($d['id'] ?? 0));
        if ($c['owner_user_id'] !== null) {
            fail('error_validation');
        }
        // Membership never deletes, archives or conceals existing personal records.
        $this->db->one(
            'SELECT user_id FROM user_categories WHERE user_id=? AND category_id=? FOR UPDATE',
            [$this->uid(), $c['id']],
        );
        if (
            $this->db->one(
                'SELECT id FROM habits WHERE owner_user_id=? AND category_id=? LIMIT 1',
                [$this->uid(), $c['id']],
            )
        ) {
            fail('error_category_has_habits');
        }
        $this->db->run('DELETE FROM user_categories WHERE user_id=? AND category_id=?', [
            $this->uid(),
            $c['id'],
        ]);
    }

    public function saveCategory(array $d, bool $global = false): int
    {
        if ($global) {
            $this->admin();
        }
        $id = (int) ($d['id'] ?? 0);
        $owner = $global ? null : $this->uid();
        if ($id) {
            $c = $this->category($id);
            if ($c['owner_user_id'] !== $owner) {
                fail('error_forbidden', 403);
            }
        }
        $name = trim(Validate::text($d, 'name', 100));
        $desc = Validate::text($d, 'description', 2000, false);
        $icon = Validate::choice($d['icon'] ?? 'sparkles', [
            'sparkles',
            'dumbbell',
            'flower',
            'book',
            'heart',
            'leaf',
            'sun',
            'moon',
            'coffee',
            'music',
            'briefcase',
        ]);
        $color = Validate::color($d['color'] ?? '#B8A4D4');
        if ($id) {
            $this->db->run(
                'UPDATE habit_categories SET name=?,translation_key=NULL,description=?,icon=?,color=? WHERE id=?',
                [$name, $desc, $icon, $color, $id],
            );
        } else {
            $this->db->run(
                'INSERT INTO habit_categories(owner_user_id,name,description,icon,color) VALUES (?,?,?,?,?)',
                [$owner, $name, $desc, $icon, $color],
            );
            $id = $this->db->id();
        }
        return $id;
    }

    public function deleteCategory(array $d, bool $global = false): void
    {
        if ($global) {
            $this->admin();
        }
        $c = $this->category((int) ($d['id'] ?? 0));
        if ($c['owner_user_id'] !== ($global ? null : $this->uid())) {
            fail('error_forbidden', 403);
        }
        if (
            $this->db->one('SELECT id FROM habits WHERE category_id=? LIMIT 1', [$c['id']]) ||
            $this->db->one('SELECT id FROM habit_shares WHERE category_id=? LIMIT 1', [$c['id']]) ||
            $this->db->one('SELECT id FROM routines WHERE category_id=? LIMIT 1', [$c['id']]) ||
            $this->db->one('SELECT id FROM habit_templates WHERE category_id=? LIMIT 1', [
                $c['id'],
            ]) ||
            $this->db->one('SELECT id FROM invitation_receipts WHERE category_id=? LIMIT 1', [
                $c['id'],
            ])
        ) {
            fail('error_category_used');
        }
        $this->db->run('DELETE FROM habit_categories WHERE id=?', [$c['id']]);
    }

    public function requestCategory(array $d): void
    {
        $name = trim(Validate::text($d, 'name', 100));
        $desc = Validate::text($d, 'description', 2000, false);
        $reason = Validate::text($d, 'reason', 2000);
        $icon = Validate::choice($d['icon'] ?? 'sparkles', [
            'sparkles',
            'dumbbell',
            'flower',
            'book',
            'heart',
            'leaf',
            'sun',
            'moon',
            'coffee',
            'music',
            'briefcase',
        ]);
        $color = Validate::color($d['color'] ?? '#B8A4D4');
        if (
            $this->db->one(
                'SELECT id FROM habit_categories WHERE owner_user_id IS NULL AND name=?',
                [$name],
            ) ||
            $this->db->one(
                "SELECT id FROM category_requests WHERE user_id=? AND name=? AND status='pending'",
                [$this->uid(), $name],
            )
        ) {
            fail('error_duplicate');
        }
        $this->db->run(
            'INSERT INTO category_requests(user_id,name,description,icon,color,reason) VALUES (?,?,?,?,?,?)',
            [$this->uid(), $name, $desc, $icon, $color, $reason],
        );
    }

    public function reviewCategory(array $d): void
    {
        $this->admin();
        $r = $this->db->one('SELECT * FROM category_requests WHERE id=? FOR UPDATE', [
            (int) ($d['id'] ?? 0),
        ]);
        if (!$r || $r['status'] !== 'pending') {
            fail('error_not_found', 404);
        }
        $status = Validate::choice($d['status'] ?? '', ['approved', 'rejected']);
        $feedback = Validate::text($d, 'feedback', 1000, $status === 'rejected');
        if ($status === 'approved') {
            $category = $r;
            unset($category['id']);
            $categoryId = $this->saveCategory($category, true);
            $this->db->run('INSERT IGNORE INTO user_categories(user_id,category_id) VALUES (?,?)', [
                $r['user_id'],
                $categoryId,
            ]);
        }
        $this->db->run(
            'UPDATE category_requests SET status=?,feedback=?,reviewed_by=?,reviewed_at=UTC_TIMESTAMP() WHERE id=?',
            [$status, $feedback, $this->uid(), $r['id']],
        );
        $this->notify(
            (int) $r['user_id'],
            'notification_category_' . $status,
            $r['name'] . ($feedback ? ' — ' . $feedback : ''),
        );
    }
}
