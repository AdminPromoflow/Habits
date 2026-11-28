<?php
declare(strict_types=1);

final class Habits extends BaseModel
{
    public function list(): array
    {
        $rows = $this->db->all(
            "SELECT h.*,u.name AS owner_name,c.name AS category_name,c.translation_key AS category_key,c.color,c.icon,r.name AS routine_name
          FROM habits h JOIN users u ON u.id=h.owner_user_id JOIN habit_categories c ON c.id=h.category_id LEFT JOIN routines r ON r.id=h.routine_id
          WHERE h.owner_user_id=? OR (u.status='active' AND EXISTS(SELECT 1 FROM habit_shares s WHERE s.recipient_user_id=? AND s.owner_user_id=h.owner_user_id AND s.status='accepted' AND
          (s.habit_id=h.id OR (s.category_id=h.category_id AND (s.include_future=1 OR EXISTS(SELECT 1 FROM share_habits sh WHERE sh.share_id=s.id AND sh.habit_id=h.id))))))
          ORDER BY h.sort_order,h.scheduled_time,h.id",
            [$this->uid(), $this->uid()],
        );
        foreach ($rows as &$h) {
            $h = array_merge($h, $this->access($h));
            $h['schedule_days'] = json_decode($h['schedule_days'], true);
            $h['recurrence_rule'] = Schedule::rule($h);
            $h['progress_consent'] =
                $this->db->one(
                    'SELECT progress_consent FROM habit_collaborators WHERE habit_id=? AND user_id=?',
                    [$h['id'], $this->uid()],
                )['progress_consent'] ?? 'none';
            $h['tracking_start'] = $h['start_date'];
            if ($h['permission'] !== 'owner') {
                $joined = $this->db->one(
                    'SELECT joined_at FROM habit_collaborators WHERE habit_id=? AND user_id=?',
                    [$h['id'], $this->uid()],
                );
                $h['tracking_start'] = $joined
                    ? max(
                        $h['start_date'],
                        (new DateTimeImmutable($joined['joined_at'], new DateTimeZone('UTC')))
                            ->setTimezone(new DateTimeZone($this->user['timezone']))
                            ->format('Y-m-d'),
                    )
                    : $this->today();
            }
            $h['group'] = null;
            $shared =
                $h['permission'] !== 'owner' ||
                $this->db->one(
                    "SELECT s.id FROM habit_shares s WHERE s.owner_user_id=? AND s.status='accepted' AND (s.habit_id=? OR (s.category_id=? AND (s.include_future=1 OR EXISTS(SELECT 1 FROM share_habits sh WHERE sh.share_id=s.id AND sh.habit_id=?)))) LIMIT 1",
                    [$this->uid(), $h['id'], $h['category_id'], $h['id']],
                );
            if ($shared) {
                $h['group'] = (new SharingModel($this->db, $this->user))->group([
                    'habit_id' => $h['id'],
                ]);
            }
        }
        return $rows;
    }

    public function saveHabit(array $d): int
    {
        $id = (int) ($d['id'] ?? 0);
        $old = $id ? $this->habit($id, 'editor', true) : null;
        $owner = $old ? (int) $old['owner_user_id'] : $this->uid();
        $category = (int) ($d['category_id'] ?? ($old['category_id'] ?? 0));
        $this->selectedCategory($category, $owner);
        $routine = !empty($d['routine_id']) ? (int) $d['routine_id'] : null;
        if ($old && $old['permission'] !== 'owner') {
            $category = (int) $old['category_id'];
            $routine = $old['routine_id'];
        }
        if (
            $routine &&
            !$this->db->one(
                'SELECT id FROM routines WHERE id=? AND owner_user_id=? AND category_id=?',
                [$routine, $owner, $category],
            )
        ) {
            fail('error_validation');
        }
        $name = Validate::text($d, 'name');
        $description = Validate::text($d, 'description', 5000, false);
        $goal = Validate::number($d['goal'] ?? 1, 0.01);
        $unit = Validate::text($d, 'unit', 40, false);
        [$recurrence, $days, $start, $end, $time, $rule, $endTime] = Schedule::fields($d + ['recurrence' => $old['recurrence'] ?? 'weekly', 'recurrence_rule' => Schedule::rule($old ?? []), 'end_time' => $old['end_time'] ?? null], $this->today());
        $section = Validate::text($d, 'section', 150, false);
        if ($old) {
            $this->db->run(
                'UPDATE habits SET name=?,description=?,category_id=?,routine_id=?,goal=?,unit=?,schedule_days=?,scheduled_time=?,start_date=?,end_date=?,section=?,recurrence=?,recurrence_rule=?,end_time=? WHERE id=?',
                [
                    $name,
                    $description,
                    $category,
                    $routine,
                    $goal,
                    $unit,
                    $days,
                    $time,
                    $start,
                    $end,
                    $section,
                    $recurrence,
                    $rule,
                    $endTime,
                    $id,
                ],
            );
            if ($category != (int) $old['category_id']) {
                // A snapshot never revives a moved-away habit when it is later moved back.
                $this->db->run(
                    'DELETE sh FROM share_habits sh JOIN habit_shares s ON s.id=sh.share_id WHERE sh.habit_id=? AND s.category_id IS NOT NULL',
                    [$id],
                );
            }
            $this->activity($id, 'habit_updated');
        } else {
            $this->db->run(
                'INSERT INTO habits(owner_user_id,category_id,routine_id,name,description,goal,unit,schedule_days,scheduled_time,start_date,end_date,section,recurrence,recurrence_rule,end_time) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                [
                    $owner,
                    $category,
                    $routine,
                    $name,
                    $description,
                    $goal,
                    $unit,
                    $days,
                    $time,
                    $start,
                    $end,
                    $section,
                    $recurrence,
                    $rule,
                    $endTime,
                ],
            );
            $id = $this->db->id();
        }
        $priority = new ActivityPriority($this->db, $this->user);
        $priority->save('habits', $id, $d, $old ?? []);
        $priority->syncActivity('habits', $id, $d, !$old);
        (new SharingModel($this->db, $this->user))->syncCollaborators();
        (new GoalsModel($this->db, $this->user))->saveActivity('habit', $id, $d);
        return $id;
    }

    public function archiveHabit(array $d): void
    {
        $h = $this->habit((int) ($d['id'] ?? 0), 'owner', true);
        $status = Validate::choice($d['status'] ?? 'archived', ['active', 'archived']);
        $this->db->run('UPDATE habits SET status=? WHERE id=?', [$status, $h['id']]);
    }

    public function deleteHabit(array $d): void
    {
        $habit = $this->habit((int) ($d['id'] ?? 0), 'owner', true);
        $id = (int) $habit['id'];
        // Remove references without deleting the containing MindSpace document.
        $items = $this->db->all("SELECT id,content_json FROM mindspace_items WHERE kind='habits' AND JSON_CONTAINS(content_json, ?, '$.habit_ids') FOR UPDATE", [json_encode($id)]);
        foreach ($items as $item) {
            $content = json_decode($item['content_json'], true);
            $content['habit_ids'] = array_values(array_filter($content['habit_ids'], static fn($value) => (int) $value !== $id));
            $this->db->run('UPDATE mindspace_items SET content_json=?,version=version+1 WHERE id=?', [json_encode($content),$item['id']]);
        }
        foreach (['habit_completions','habit_collaborators','collaboration_activity','share_habits','invitation_receipts','habit_shares'] as $table) {
            $this->db->run("DELETE FROM $table WHERE habit_id=?", [$id]);
        }
        $this->db->run('DELETE FROM habits WHERE id=? AND owner_user_id=?', [$id,$this->uid()]);
    }

    public static function scheduled(array $h, string $date): bool
    {
        return Schedule::occurs($h, $date);
    }

    public function complete(array $d): void
    {
        $h = $this->habit((int) ($d['habit_id'] ?? 0), 'participant', true);
        if (isset($d['user_id']) && (int) $d['user_id'] !== $this->uid()) {
            fail('error_forbidden', 403);
        }
        $date = Validate::date($d['date'] ?? $this->today());
        if ($date > $this->today() || !self::scheduled($h, $date) || $h['status'] !== 'active') {
            fail('error_date');
        }
        if ($h['permission'] !== 'owner') {
            $joined = $this->db->one(
                'SELECT joined_at FROM habit_collaborators WHERE habit_id=? AND user_id=?',
                [$h['id'], $this->uid()],
            );
            $joinedDate = $joined
                ? (new DateTimeImmutable($joined['joined_at'], new DateTimeZone('UTC')))
                    ->setTimezone(new DateTimeZone($this->user['timezone']))
                    ->format('Y-m-d')
                : null;
            if (($this->workspaceHabit['id'] ?? null) === (int) $h['id']) $joinedDate = $this->workspaceHabit['joined'] ?? $this->today();
            if (!$joinedDate || $date < $joinedDate) {
                fail('error_date');
            }
        }
        $amount = Validate::number($d['amount'] ?? $h['goal']);
        $note = Validate::text($d, 'note', 1000, false);
        if ($amount === 0.0) {
            $this->db->run(
                'DELETE FROM habit_completions WHERE habit_id=? AND user_id=? AND completed_on=?',
                [$h['id'], $this->uid(), $date],
            );
        } else {
            $this->db->run(
                'INSERT INTO habit_completions(habit_id,user_id,completed_on,amount,goal_at_time,note) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE amount=VALUES(amount),note=VALUES(note)',
                [$h['id'], $this->uid(), $date, $amount, $h['goal'], $note],
            );
        }
        if ($amount > 0 && !empty($h['source_item_id']) && $h['permission'] === 'owner') {
            $record = $this->db->one('SELECT goal_at_time FROM habit_completions WHERE habit_id=? AND user_id=? AND completed_on=?', [$h['id'], $this->uid(), $date]);
            if ($amount >= (float) $record['goal_at_time']) (new PlannerCardSync($this->db, $this->user))->complete($h);
        }
        // No progress values are placed in a shared activity feed.
    }
}
