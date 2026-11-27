<?php
declare(strict_types=1);

final class PlannerCardSync extends BaseModel
{
    // Called inside the completion transaction. Personal progress on a shared
    // habit must never change somebody else's board.
    public function complete(array $entry): void
    {
        if (empty($entry['source_item_id']) || empty($entry['source_card_key']) || (int) $entry['owner_user_id'] !== $this->uid()) return;
        $item = $this->db->one(
            "SELECT i.id,i.content_json FROM mindspace_items i JOIN mindspaces m ON m.id=i.mindspace_id WHERE i.id=? AND i.kind IN ('kanban','scrum') AND m.owner_user_id=? FOR UPDATE",
            [$entry['source_item_id'], $this->uid()],
        );
        // A deleted card or board does not prevent completing its saved activity.
        if (!$item) return;
        $content = json_decode($item['content_json'], true, 512, JSON_THROW_ON_ERROR);
        foreach ($content['cards'] ?? [] as $index => $card) {
            if ($card['id'] !== $entry['source_card_key']) continue;
            $done = 'done';
            // Extra sprints have their own three standard columns with UUIDs.
            foreach ($content['sprints'] ?? [] as $sprint) {
                if (in_array($card['status'], array_column($sprint['columns'], 'id'), true)) {
                    $done = $sprint['columns'][2]['id'];
                    break;
                }
            }
            if ($card['status'] === $done) return;
            // Patch only this status, retaining every card, column and sprint.
            // The version bump makes an older open editor detect the change.
            $this->db->run(
                'UPDATE mindspace_items SET content_json=JSON_SET(content_json, ?, ?),version=version+1,updated_at=UTC_TIMESTAMP() WHERE id=?',
                ['$.cards['.$index.'].status', $done, $item['id']],
            );
            return;
        }
    }
}
