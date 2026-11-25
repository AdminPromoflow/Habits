<?php
declare(strict_types=1);

final class CalendarModel extends BaseModel
{
    public function data(): array
    {
        // Keep an older installation readable until its migration is applied.
        if (!$this->db->one("SELECT version FROM schema_migrations WHERE version='018_daily_planner.sql'")) return ['tasks'=>[], 'completions'=>[]];
        $tasks = $this->db->all('SELECT * FROM calendar_tasks WHERE owner_user_id=? ORDER BY start_date,scheduled_time,id', [$this->uid()]);
        foreach ($tasks as &$task) { $task['schedule_days'] = json_decode($task['schedule_days'], true); $task['recurrence_rule'] = Schedule::rule($task); }
        return ['tasks'=>$tasks, 'completions'=>$this->db->all('SELECT c.task_id,c.completed_on FROM calendar_task_completions c JOIN calendar_tasks t ON t.id=c.task_id WHERE t.owner_user_id=?', [$this->uid()])];
    }

    private function task(int $id): array
    {
        return $this->db->one('SELECT * FROM calendar_tasks WHERE id=? AND owner_user_id=? FOR UPDATE', [$id, $this->uid()]) ?? fail('error_not_found', 404);
    }

    public function save(array $d): array
    {
        $source = $this->source($d);
        $kind = Validate::choice($d['kind'] ?? 'task', ['task','habit']);
        $id = (int) ($d['id'] ?? 0);
        $old = $id ? ($kind === 'habit' ? $this->habit($id, isset($d['category_choice']) ? 'owner' : 'editor', true) : $this->task($id)) : null;
        if (array_key_exists('category_choice', $d)) {
            $d['category_id'] = $this->plannerCategory($d, $kind);
            if ($kind === 'habit' && $old && (int) $old['category_id'] !== $d['category_id']) $d['routine_id'] = null;
        } elseif (!array_key_exists('category_id', $d) && $old) $d['category_id'] = $old['category_id'];
        if ($kind === 'habit') {
            // Quick creation also works before the user has selected any categories.
            if (empty($d['category_id'])) {
                $name = $this->user['language'] === 'es' ? 'Mi día a día' : 'My day to day';
                $category = $this->db->one('SELECT id FROM habit_categories WHERE owner_user_id=? AND name=?', [$this->uid(), $name]);
                $d['category_id'] = $category['id'] ?? (new CategoriesModel($this->db, $this->user))->saveCategory(['name'=>$name]);
            }
            $id = (new Habits($this->db, $this->user))->saveHabit($d);
            if ($source) $this->attachSource('habits', $id, $source);
            return ['id'=>$id, 'kind'=>'habit'];
        }
        $category = !empty($d['category_id']) ? (int) $d['category_id'] : null;
        if ($category) $this->selectedCategory($category);
        $name = Validate::text($d, 'name');
        $description = Validate::text($d, 'description', 5000, false);
        [$repeat,$days,$start,$end,$time,$rule] = Schedule::fields($d + ['recurrence'=>'once'], $this->today());
        $values = [$name,$description,$repeat,$days,$time,$start,$end,$rule,$category];
        if ($id) {
            $this->db->run('UPDATE calendar_tasks SET name=?,description=?,recurrence=?,schedule_days=?,scheduled_time=?,start_date=?,end_date=?,recurrence_rule=?,category_id=? WHERE id=? AND owner_user_id=?', [...$values,$id,$this->uid()]);
        } else {
            $this->db->run('INSERT INTO calendar_tasks(name,description,recurrence,schedule_days,scheduled_time,start_date,end_date,recurrence_rule,category_id,owner_user_id) VALUES (?,?,?,?,?,?,?,?,?,?)', [...$values,$this->uid()]);
            $id = $this->db->id();
        }
        if ($source) $this->attachSource('calendar_tasks', $id, $source);
        return ['id'=>$id, 'kind'=>'task'];
    }

    private function plannerCategory(array $d, string $kind): ?int
    {
        $choice = Validate::text($d, 'category_choice', 80);
        if ($choice === 'none' && $kind === 'task') return null;
        if ($choice === 'new' || $choice === 'default') {
            $name = $choice === 'new' ? trim(Validate::text($d, 'new_category_name', 100)) : ($this->user['language'] === 'es' ? 'Mi día a día' : 'My day to day');
            $existing = $this->db->one('SELECT id FROM habit_categories WHERE owner_user_id=? AND name=? ORDER BY id LIMIT 1 FOR UPDATE', [$this->uid(), $name]);
            return $existing ? (int) $existing['id'] : (new CategoriesModel($this->db, $this->user))->saveCategory(['name'=>$name]);
        }
        if (!preg_match('/^(category|folder|space):([1-9][0-9]*)$/D', $choice, $match)) fail('error_validation');
        $id = (int) $match[2];
        if ($match[1] === 'category') {
            $category = $this->category($id);
            // Choosing a catalog category explicitly enrolls only the current account.
            if ($category['owner_user_id'] === null) $this->db->run('INSERT IGNORE INTO user_categories(user_id,category_id) VALUES (?,?)', [$this->uid(), $id]);
            return $id;
        }
        $folder = $match[1] === 'folder';
        $source = $folder
            ? $this->db->one("SELECT i.id,i.name FROM mindspace_items i JOIN mindspaces m ON m.id=i.mindspace_id WHERE i.id=? AND i.kind='folder' AND m.owner_user_id=? FOR UPDATE", [$id,$this->uid()])
            : $this->db->one('SELECT id,name FROM mindspaces WHERE id=? AND owner_user_id=? FOR UPDATE', [$id,$this->uid()]);
        if (!$source) fail('error_not_found',404);
        $column = $folder ? 'source_folder_id' : 'source_mindspace_id';
        $existing = $this->db->one("SELECT id FROM habit_categories WHERE $column=? AND owner_user_id=?", [$id,$this->uid()]);
        if ($existing) return (int) $existing['id'];
        $category = (new CategoriesModel($this->db, $this->user))->saveCategory(['name'=>mb_substr($source['name'],0,100)]);
        $this->db->run("UPDATE habit_categories SET $column=? WHERE id=?", [$id,$category]);
        return $category;
    }

    private function source(array $d): ?array
    {
        if (empty($d['source_diagram_id'])) return null;
        $id = (int) $d['source_diagram_id'];
        $key = Validate::text($d, 'source_node_key', 64);
        if (!$this->db->one('SELECT d.id FROM diagrams d JOIN diagram_nodes n ON n.diagram_id=d.id WHERE d.id=? AND d.owner_user_id=? AND n.node_key=? FOR UPDATE', [$id,$this->uid(),$key])) fail('error_not_found',404);
        return [$id,$key];
    }

    private function attachSource(string $table, int $id, array $source): void
    {
        $this->db->run("UPDATE $table SET source_diagram_id=?,source_node_key=? WHERE id=? AND owner_user_id=?", [...$source,$id,$this->uid()]);
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
