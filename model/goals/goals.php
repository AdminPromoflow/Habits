<?php
declare(strict_types=1);

final class GoalsModel extends BaseModel
{
    public function available(): bool
    {
        return (bool) $this->db->one("SELECT version FROM schema_migrations WHERE version='025_personal_goals.sql'");
    }

    public function data(): array
    {
        if (!$this->available()) return ['items'=>[], 'links'=>[]];
        $links = [];
        foreach (['task','habit'] as $kind) {
            foreach ($this->db->all("SELECT l.goal_id,l.{$kind}_id AS id FROM goal_{$kind}s l JOIN goals g ON g.id=l.goal_id WHERE g.owner_user_id=?", [$this->uid()]) as $row) $links[] = $row + ['kind'=>$kind];
        }
        foreach ($this->db->all('SELECT l.* FROM goal_cards l JOIN goals g ON g.id=l.goal_id WHERE g.owner_user_id=?', [$this->uid()]) as $row) $links[] = $row + ['kind'=>'card'];
        return ['items'=>$this->db->all('SELECT * FROM goals WHERE owner_user_id=? ORDER BY created_at DESC,id DESC', [$this->uid()]), 'links'=>$links];
    }

    private function owned(int $id): array
    {
        return $this->db->one('SELECT * FROM goals WHERE id=? AND owner_user_id=? FOR UPDATE', [$id,$this->uid()]) ?? fail('error_not_found',404);
    }

    public function save(array $data): array
    {
        $id = (int) ($data['id'] ?? 0);
        $old = $id ? $this->owned($id) : [];
        $values = [Validate::text($data,'name'), Validate::text($data,'description',5000,false), Validate::choice($data['status'] ?? 'active',['active','completed']), empty($data['target_date']) ? null : Validate::date($data['target_date'])];
        if ($id) $this->db->run('UPDATE goals SET name=?,description=?,status=?,target_date=? WHERE id=? AND owner_user_id=?', [...$values,$id,$this->uid()]);
        else {
            $this->db->run('INSERT INTO goals(name,description,status,target_date,owner_user_id) VALUES (?,?,?,?,?)', [...$values,$this->uid()]);
            $id = $this->db->id();
        }
        (new ActivityPriority($this->db, $this->user))->save('goals', $id, $data, $old);
        return ['id'=>$id];
    }

    public function delete(array $data): void
    {
        $goal = $this->owned((int) ($data['id'] ?? 0));
        // Cascades remove associations only; the activities and their history remain.
        $this->db->run('DELETE FROM goals WHERE id=? AND owner_user_id=?', [$goal['id'],$this->uid()]);
    }

    private function ids(mixed $ids): array
    {
        if (!is_array($ids) || !array_is_list($ids) || count($ids)>200) fail('error_validation');
        foreach ($ids as $id) {
            if (!is_int($id) || $id<1) fail('error_validation');
            $this->owned($id);
        }
        return array_values(array_unique($ids));
    }

    private function replaceActivity(string $kind, int $id, array $ids): void
    {
        $this->db->run("DELETE l FROM goal_{$kind}s l JOIN goals g ON g.id=l.goal_id WHERE l.{$kind}_id=? AND g.owner_user_id=?", [$id,$this->uid()]);
        foreach ($ids as $goal) $this->db->run("INSERT INTO goal_{$kind}s(goal_id,{$kind}_id) VALUES (?,?)", [$goal,$id]);
    }

    // Called only after the activity model has authorized and saved the activity.
    public function saveActivity(string $kind, int $id, array $data): void
    {
        if (!$this->available()) return;
        $table = $kind === 'task' ? 'calendar_tasks' : 'habits';
        $entry = $this->db->one("SELECT * FROM $table WHERE id=?", [$id]);
        $card = null;
        if ((int) $entry['owner_user_id'] === $this->uid() && !empty($entry['source_item_id'])) {
            $item = $this->db->one('SELECT i.content_json FROM mindspace_items i JOIN mindspaces m ON m.id=i.mindspace_id WHERE i.id=? AND m.owner_user_id=?', [$entry['source_item_id'],$this->uid()]);
            foreach (json_decode($item['content_json'] ?? '{}',true)['cards'] ?? [] as $candidate) if ($candidate['id'] === $entry['source_card_key']) $card = $candidate;
        }
        if (!array_key_exists('goal_ids',$data)) {
            // Scheduling a card inherits its goals, including older clients.
            if (!$card) return;
            $ids = array_map('intval',array_column($this->db->all('SELECT l.goal_id FROM goal_cards l JOIN goals g ON g.id=l.goal_id WHERE l.item_id=? AND l.card_key=? AND g.owner_user_id=?', [$entry['source_item_id'],$card['id'],$this->uid()]),'goal_id'));
        } else $ids = $this->ids($data['goal_ids']);
        $this->replaceActivity($kind,$id,$ids);
        if ($card) $this->saveCard((int) $entry['source_item_id'],$card,$ids,json_decode($item['content_json'],true));
    }

    private function cardDone(array $card, array $content): bool
    {
        $done = 'done';
        foreach ($content['sprints'] ?? [] as $sprint) if (in_array($card['status'],array_column($sprint['columns'],'id'),true)) $done = $sprint['columns'][2]['id'];
        return $card['status'] === $done;
    }

    private function saveCard(int $item, array $card, array $ids, array $content): void
    {
        $old = $this->db->one('SELECT l.completed_on FROM goal_cards l JOIN goals g ON g.id=l.goal_id WHERE l.item_id=? AND l.card_key=? AND g.owner_user_id=? AND l.completed_on IS NOT NULL LIMIT 1', [$item,$card['id'],$this->uid()]);
        $date = $this->cardDone($card,$content) ? ($old['completed_on'] ?? $this->today()) : null;
        $this->db->run('DELETE l FROM goal_cards l JOIN goals g ON g.id=l.goal_id WHERE l.item_id=? AND l.card_key=? AND g.owner_user_id=?', [$item,$card['id'],$this->uid()]);
        foreach ($ids as $goal) $this->db->run('INSERT INTO goal_cards(goal_id,item_id,card_key,completed_on) VALUES (?,?,?,?)', [$goal,$item,$card['id'],$date]);
        // A card and its scheduled version are one contribution, with the same goals.
        foreach (['task'=>'calendar_tasks','habit'=>'habits'] as $kind=>$table) {
            foreach ($this->db->all("SELECT id FROM $table WHERE source_item_id=? AND source_card_key=? AND owner_user_id=?", [$item,$card['id'],$this->uid()]) as $entry) $this->replaceActivity($kind,(int) $entry['id'],$ids);
        }
    }

    public function syncBoard(int $item, array $rawCards, array $content): void
    {
        if (!$this->available()) return;
        $raw = array_column($rawCards,null,'id');
        $keys = [];
        foreach ($content['cards'] as $card) {
            $keys[] = $card['id'];
            if (array_key_exists('goal_ids',$raw[$card['id']] ?? [])) $this->saveCard($item,$card,$this->ids($raw[$card['id']]['goal_ids']),$content);
            $this->db->run('UPDATE goal_cards l JOIN goals g ON g.id=l.goal_id SET l.completed_on='.($this->cardDone($card,$content) ? 'COALESCE(l.completed_on,?)' : 'NULL').' WHERE l.item_id=? AND l.card_key=? AND g.owner_user_id=?', [...($this->cardDone($card,$content) ? [$this->today()] : []),$item,$card['id'],$this->uid()]);
        }
        $this->db->run('DELETE l FROM goal_cards l JOIN goals g ON g.id=l.goal_id WHERE l.item_id=? AND g.owner_user_id=?'.($keys ? ' AND l.card_key NOT IN ('.implode(',',array_fill(0,count($keys),'?')).')' : ''), [$item,$this->uid(),...$keys]);
    }
}
