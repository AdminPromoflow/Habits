<?php
declare(strict_types=1);

final class ActivityPriority extends BaseModel
{
    public static function scale(mixed $value): int
    {
        if ((!is_int($value) && !(is_string($value) && preg_match('/^[1-9][0-9]*$/D', $value))) || $value < 1 || $value > 1000000) fail('error_validation');
        return (int) $value;
    }

    public static function fields(array $data, array $old = [], int $default = 10): array
    {
        $scale = self::scale($data['priority_scale'] ?? $old['priority_scale'] ?? $default);
        $result = ['priority_scale'=>$scale];
        foreach (['importance','urgency'] as $key) {
            $value = array_key_exists($key,$data) ? $data[$key] : ($old[$key] ?? null);
            if ($value === null || $value === '' || $value === 0 || $value === '0') { $result[$key] = null; continue; }
            $value = self::scale($value);
            if (!array_key_exists($key,$data) && !empty($old['priority_scale']) && $scale !== (int) $old['priority_scale']) $value = max(1,(int) round($value * $scale / (int) $old['priority_scale']));
            if ($value > $scale) fail('error_validation');
            $result[$key] = $value;
        }
        return $result;
    }

    // Only called after the owning model has authorized the activity.
    public function save(string $table, int $id, array $data, array $old = []): void
    {
        if (!in_array($table,['habits','calendar_tasks','goals'],true)) throw new LogicException('Invalid priority table');
        $values = self::fields($data,$old,(int) ($this->user['priority_scale'] ?? 10));
        $this->db->run("UPDATE $table SET importance=?,urgency=?,priority_scale=? WHERE id=?", [$values['importance'],$values['urgency'],$values['priority_scale'],$id]);
    }

    public function syncBoard(int $item, array $cards): void
    {
        foreach ($cards as $card) {
            $values = self::fields($card);
            foreach (['habits','calendar_tasks'] as $table) $this->db->run("UPDATE $table SET importance=?,urgency=?,priority_scale=? WHERE source_item_id=? AND source_card_key=? AND owner_user_id=?", [$values['importance'],$values['urgency'],$values['priority_scale'],$item,$card['id'],$this->uid()]);
        }
    }

    public function syncActivity(string $table, int $id, array $data, bool $created = false): void
    {
        if (!in_array($table,['habits','calendar_tasks'],true)) throw new LogicException('Invalid activity table');
        $entry = $this->db->one("SELECT * FROM $table WHERE id=?", [$id]);
        if (empty($entry['source_item_id']) || (int) $entry['owner_user_id'] !== $this->uid()) return;
        $item = $this->db->one("SELECT i.id,i.content_json FROM mindspace_items i JOIN mindspaces m ON m.id=i.mindspace_id WHERE i.id=? AND i.kind IN ('kanban','scrum') AND m.owner_user_id=? FOR UPDATE", [$entry['source_item_id'],$this->uid()]);
        if (!$item) return;
        $content = json_decode($item['content_json'],true,512,JSON_THROW_ON_ERROR);
        foreach ($content['cards'] as &$card) {
            if ($card['id'] !== $entry['source_card_key']) continue;
            $inherit = $created && !array_intersect(['importance','urgency','priority_scale'],array_keys($data));
            $values = self::fields($inherit ? $card : $entry);
            if (self::fields($card) !== $values) {
                $card = array_replace($card,$values);
                $this->db->run('UPDATE mindspace_items SET content_json=?,version=version+1,updated_at=UTC_TIMESTAMP() WHERE id=?', [json_encode($content,JSON_THROW_ON_ERROR),$item['id']]);
            }
            $this->syncBoard((int) $item['id'],[array_replace($card,$values)]);
            return;
        }
    }
}
