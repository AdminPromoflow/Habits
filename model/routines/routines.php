<?php
declare(strict_types=1);

final class RoutinesModel extends BaseModel
{
    public function saveRoutine(array $d): int
    {
        $category = (int) ($d['category_id'] ?? 0);
        $this->selectedCategory($category);
        $name = Validate::text($d, 'name');
        $desc = Validate::text($d, 'description', 3000, false);
        $start = Validate::date($d['start_date'] ?? $this->today());
        $end = !empty($d['end_date']) ? Validate::date($d['end_date']) : null;
        if ($end && $end < $start) {
            fail('error_date');
        }
        $this->db->run(
            'INSERT INTO routines(owner_user_id,category_id,name,description,start_date,end_date) VALUES (?,?,?,?,?,?)',
            [$this->uid(), $category, $name, $desc, $start, $end],
        );
        return $this->db->id();
    }
}
