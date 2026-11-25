<?php
declare(strict_types=1);

final class DashboardModel extends BaseModel
{
    public function notifications(): array
    {
        return [
            'notifications' => $this->db->all('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 50', [$this->uid()]),
            'unread_notifications' => (int) $this->db->one('SELECT COUNT(*) AS total FROM notifications WHERE user_id=? AND is_read=0', [$this->uid()])['total'],
        ];
    }
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
            'mindspace' => (new MindSpacesModel($this->db, $this->user))->available() ? (new MindSpacesModel($this->db, $this->user))->get() : null,
            'mindspace_shares' => (new MindSpaceShares($this->db, $this->user))->catalog(),
            'diagrams' => (new DiagramsModel($this->db, $this->user))->list(),
            'today' => $this->today(),
            'habits' => $habits,
            'calendar' => (new CalendarModel($this->db, $this->user))->data(),
            'completions' => $completions,
            'categories' => $this->db->all(
                'SELECT c.id,c.owner_user_id,c.name,c.translation_key,c.description,c.icon,c.color,c.source_mindspace_id,c.source_folder_id FROM habit_categories c WHERE c.owner_user_id=? OR (c.owner_user_id IS NULL AND EXISTS(SELECT 1 FROM user_categories uc WHERE uc.user_id=? AND uc.category_id=c.id)) ORDER BY c.owner_user_id IS NOT NULL DESC,c.id',
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
            ...$this->notifications(),
            'weights' => $this->db->all(
                'SELECT recorded_on,weight_kg FROM wellness_entries WHERE user_id=? ORDER BY recorded_on',
                [$this->uid()],
            ),
            'outgoing' => $this->db->all(
                "SELECT r.id,r.recipient_email,r.permission,r.progress_visibility,r.include_future,r.status,r.invitation_message,r.created_at,r.habit_id,r.category_id,COALESCE(h.name,c.name) AS resource_name,c.translation_key AS category_key,CASE WHEN r.status='accepted' THEN recipient.name ELSE NULL END AS recipient_name FROM invitation_receipts r LEFT JOIN habits h ON h.id=r.habit_id LEFT JOIN habit_categories c ON c.id=r.category_id LEFT JOIN habit_shares s ON s.id=r.share_id LEFT JOIN users recipient ON recipient.id=s.recipient_user_id WHERE r.owner_user_id=? ORDER BY r.id DESC",
                [$this->uid()],
            ),
            'incoming' => $this->db->all(
                "SELECT s.id,s.owner_user_id,s.permission,s.progress_visibility,s.include_future,s.status,s.invitation_message,s.created_at,s.habit_id,s.category_id,u.name AS owner_name,u.email AS owner_email,CASE WHEN s.status IN ('pending','accepted') THEN COALESCE(h.name,c.name) ELSE NULL END AS resource_name,c.translation_key AS category_key FROM habit_shares s JOIN users u ON u.id=s.owner_user_id LEFT JOIN habits h ON h.id=s.habit_id LEFT JOIN habit_categories c ON c.id=s.category_id WHERE s.recipient_user_id=? AND u.status='active' ORDER BY s.id DESC",
                [$this->uid()],
            ),
        ];
    }
}
