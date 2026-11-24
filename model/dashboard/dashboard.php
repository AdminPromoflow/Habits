<?php
declare(strict_types=1);

final class DashboardModel extends BaseModel
{
    public function data(): array
    {
        $habits = (new Habits($this->db, $this->user))->list();
        $ids = array_column($habits, 'id');
        $completions = $ids
            ? $this->db->all(
                'SELECT habit_id,completed_on,amount,goal_at_time,note FROM habit_completions WHERE user_id=? AND habit_id IN (' .
                    implode(',', array_fill(0, count($ids), '?')) .
                    ') ORDER BY completed_on',
                array_merge([$this->uid()], $ids),
            )
            : [];
        return [
            'diagrams' => (new DiagramsModel($this->db, $this->user))->list(),
            'today' => $this->today(),
            'habits' => $habits,
            'completions' => $completions,
            'categories' => $this->db->all(
                'SELECT c.id,c.owner_user_id,c.name,c.translation_key,c.description,c.icon,c.color FROM habit_categories c WHERE c.owner_user_id=? OR (c.owner_user_id IS NULL AND EXISTS(SELECT 1 FROM user_categories uc WHERE uc.user_id=? AND uc.category_id=c.id)) ORDER BY c.owner_user_id IS NOT NULL DESC,c.id',
                [$this->uid(), $this->uid()],
            ),
            'category_catalog' => $this->db->all(
                'SELECT c.id,c.name,c.translation_key,c.description,c.icon,c.color,EXISTS(SELECT 1 FROM user_categories uc WHERE uc.user_id=? AND uc.category_id=c.id) AS selected FROM habit_categories c WHERE c.owner_user_id IS NULL ORDER BY c.id',
                [$this->uid()],
            ),
            'routines' => $this->db->all(
                'SELECT * FROM routines WHERE owner_user_id=? ORDER BY id',
                [$this->uid()],
            ),
            'requests' => $this->db->all(
                'SELECT * FROM category_requests WHERE user_id=? ORDER BY id DESC',
                [$this->uid()],
            ),
            'templates' => $this->db->all(
                'SELECT t.* FROM habit_templates t JOIN user_categories uc ON uc.category_id=t.category_id AND uc.user_id=? WHERE t.active=1 ORDER BY t.id',
                [$this->uid()],
            ),
            'notifications' => $this->db->all(
                'SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 50',
                [$this->uid()],
            ),
            'weights' => $this->db->all(
                'SELECT recorded_on,weight_kg FROM wellness_entries WHERE user_id=? ORDER BY recorded_on',
                [$this->uid()],
            ),
            'outgoing' => $this->db->all(
                'SELECT r.id,r.recipient_email,r.permission,r.progress_visibility,r.include_future,r.status,r.invitation_message,r.created_at,r.habit_id,r.category_id,COALESCE(h.name,c.name) AS resource_name,c.translation_key AS category_key FROM invitation_receipts r LEFT JOIN habits h ON h.id=r.habit_id LEFT JOIN habit_categories c ON c.id=r.category_id WHERE r.owner_user_id=? ORDER BY r.id DESC',
                [$this->uid()],
            ),
            'incoming' => $this->db->all(
                "SELECT s.id,s.owner_user_id,s.permission,s.progress_visibility,s.include_future,s.status,s.invitation_message,s.created_at,s.habit_id,s.category_id,u.name AS owner_name,CASE WHEN s.status IN ('pending','accepted') THEN COALESCE(h.name,c.name) ELSE NULL END AS resource_name,c.translation_key AS category_key FROM habit_shares s JOIN users u ON u.id=s.owner_user_id LEFT JOIN habits h ON h.id=s.habit_id LEFT JOIN habit_categories c ON c.id=s.category_id WHERE s.recipient_user_id=? AND u.status='active' ORDER BY s.id DESC",
                [$this->uid()],
            ),
        ];
    }
}
