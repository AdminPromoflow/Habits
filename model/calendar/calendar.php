<?php
declare(strict_types=1);

final class CalendarModel extends BaseModel
{
    public function data(): array
    {
        // Keep an older installation readable until its migration is applied.
        if (!$this->db->one("SELECT version FROM schema_migrations WHERE version='018_daily_planner.sql'")) return ['tasks'=>[], 'completions'=>[]];
        $tasks = $this->db->all('SELECT * FROM calendar_tasks WHERE owner_user_id=? ORDER BY start_date,scheduled_time,id', [$this->uid()]);
        foreach ($tasks as &$task) $task['schedule_days'] = json_decode($task['schedule_days'], true);
        return ['tasks'=>$tasks, 'completions'=>$this->db->all('SELECT c.task_id,c.completed_on FROM calendar_task_completions c JOIN calendar_tasks t ON t.id=c.task_id WHERE t.owner_user_id=?', [$this->uid()])];
    }

    private function task(int $id): array
    {
        return $this->db->one('SELECT * FROM calendar_tasks WHERE id=? AND owner_user_id=? FOR UPDATE', [$id, $this->uid()]) ?? fail('error_not_found', 404);
    }

    public function save(array $d): array
    {
        $kind = Validate::choice($d['kind'] ?? 'task', ['task','habit']);
        if ($kind === 'habit') {
            // Quick creation also works before the user has selected any categories.
            if (empty($d['category_id'])) {
                $name = $this->user['language'] === 'es' ? 'Mi día a día' : 'My day to day';
                $category = $this->db->one('SELECT id FROM habit_categories WHERE owner_user_id=? AND name=?', [$this->uid(), $name]);
                $d['category_id'] = $category['id'] ?? (new CategoriesModel($this->db, $this->user))->saveCategory(['name'=>$name]);
            }
            return ['id'=>(new Habits($this->db, $this->user))->saveHabit($d), 'kind'=>'habit'];
        }
        $id = (int) ($d['id'] ?? 0);
        if ($id) $this->task($id);
        $name = Validate::text($d, 'name');
        $description = Validate::text($d, 'description', 5000, false);
        [$repeat,$days,$start,$end,$time] = Schedule::fields($d, $this->today());
        $values = [$name,$description,$repeat,$days,$time,$start,$end];
        if ($id) {
            $this->db->run('UPDATE calendar_tasks SET name=?,description=?,recurrence=?,schedule_days=?,scheduled_time=?,start_date=?,end_date=? WHERE id=? AND owner_user_id=?', [...$values,$id,$this->uid()]);
        } else {
            $this->db->run('INSERT INTO calendar_tasks(name,description,recurrence,schedule_days,scheduled_time,start_date,end_date,owner_user_id) VALUES (?,?,?,?,?,?,?,?)', [...$values,$this->uid()]);
            $id = $this->db->id();
        }
        return ['id'=>$id, 'kind'=>'task'];
    }

    public function complete(array $d): void
    {
        $task = $this->task((int) ($d['id'] ?? 0));
        $date = Validate::date($d['date'] ?? $this->today());
        if ($date > $this->today() || !Schedule::occurs($task, $date)) fail('error_date');
        if (!is_bool($d['completed'] ?? null)) fail('error_validation');
        if ($d['completed']) $this->db->run('INSERT IGNORE INTO calendar_task_completions(task_id,completed_on) VALUES (?,?)', [$task['id'],$date]);
        else $this->db->run('DELETE FROM calendar_task_completions WHERE task_id=? AND completed_on=?', [$task['id'],$date]);
    }

    public function delete(array $d): void
    {
        $task = $this->task((int) ($d['id'] ?? 0));
        $this->db->run('DELETE FROM calendar_tasks WHERE id=? AND owner_user_id=?', [$task['id'],$this->uid()]);
    }
}
