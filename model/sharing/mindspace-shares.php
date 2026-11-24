<?php
declare(strict_types=1);

final class MindSpaceShares extends BaseModel
{
    public function available(): bool
    {
        return (bool) $this->db->one("SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='mindspace_shares'");
    }

    private function requireSchema(): void
    {
        if (!$this->available()) fail('error_mindspace_sharing_setup', 503);
    }

    public function catalog(): array
    {
        if (!$this->available()) return ['outgoing' => [], 'incoming' => []];
        $select = "SELECT s.id,s.owner_user_id,s.recipient_email,s.space_id,s.item_id,s.status,s.invitation_message,s.created_at,
            'viewer' AS permission,u.name AS owner_name,u.email AS owner_email,CASE WHEN s.status='accepted' THEN recipient.name ELSE NULL END AS recipient_name,COALESCE(d.name,i.name,m.name) AS resource_name,
            CASE WHEN s.space_id IS NOT NULL THEN 'space' ELSE i.kind END AS kind
            FROM mindspace_shares s JOIN users u ON u.id=s.owner_user_id LEFT JOIN users recipient ON recipient.id=s.recipient_user_id
            LEFT JOIN mindspaces m ON m.id=s.space_id
            LEFT JOIN mindspace_items i ON i.id=s.item_id LEFT JOIN diagrams d ON d.id=i.diagram_id";
        $outgoing = $this->db->all($select . ' WHERE s.owner_user_id=? ORDER BY s.created_at DESC,s.id DESC', [$this->uid()]);
        $incoming = $this->db->all($select . " WHERE s.recipient_user_id=? AND u.status='active' ORDER BY s.created_at DESC,s.id DESC", [$this->uid()]);
        foreach ($incoming as &$row) {
            // Revocation stops disclosing subsequent changes to the resource name.
            if (!in_array($row['status'], ['pending', 'accepted'], true)) $row['resource_name'] = null;
        }
        return ['outgoing' => $outgoing, 'incoming' => $incoming];
    }

    public function invite(array $data): void
    {
        $this->requireSchema();
        $type = Validate::choice($data['target'] ?? '', ['space', 'item']);
        $id = (int) ($data['id'] ?? 0);
        $email = Validate::email($data['email'] ?? null);
        if (($data['permission'] ?? 'viewer') !== 'viewer') fail('error_validation');
        $message = Validate::text($data, 'invitation_message', 1000, false);
        $resource = $type === 'space'
            ? $this->db->one('SELECT id FROM mindspaces WHERE id=? AND owner_user_id=? FOR UPDATE', [$id, $this->uid()])
            : $this->db->one('SELECT i.id FROM mindspace_items i JOIN mindspaces m ON m.id=i.mindspace_id WHERE i.id=? AND m.owner_user_id=? FOR UPDATE', [$id, $this->uid()]);
        if (!$resource) fail('error_not_found', 404);
        $space = $type === 'space' ? $id : null;
        $item = $type === 'item' ? $id : null;
        $existing = $this->db->one('SELECT id,status FROM mindspace_shares WHERE owner_user_id=? AND recipient_email=? AND space_id <=> ? AND item_id <=> ? FOR UPDATE', [$this->uid(), $email, $space, $item]);
        if ($existing && in_array($existing['status'], ['pending', 'accepted'], true)) return;
        $recipient = $this->db->one("SELECT u.id,COALESCE(s.language,'en') AS language FROM users u LEFT JOIN user_settings s ON s.user_id=u.id WHERE u.email=? AND u.status='active'", [$email]);
        $recipientId = $recipient && (int) $recipient['id'] !== $this->uid() ? $recipient['id'] : null;
        if ($existing) {
            $this->db->run("UPDATE mindspace_shares SET recipient_user_id=?,status='pending',invitation_message=?,created_at=UTC_TIMESTAMP(),responded_at=NULL WHERE id=?", [$recipientId, $message, $existing['id']]);
        } else {
            $this->db->run('INSERT INTO mindspace_shares(owner_user_id,recipient_user_id,recipient_email,space_id,item_id,invitation_message) VALUES (?,?,?,?,?,?)', [$this->uid(), $recipientId, $email, $space, $item, $message]);
        }
        // Keep the same opaque invitation behavior as habit sharing.
        if ($recipientId) {
            $this->notify((int) $recipientId, 'notification_invitation');
            $mailer = new Mailer();
            if ($mailer->ready() && !$mailer->mindspaceInvitation($email, $recipient['language'])) {
                error_log('MindSpace invitation saved, but its notification email could not be delivered.');
            }
        }
    }

    public function respond(array $data): void
    {
        $this->requireSchema();
        $share = $this->db->one("SELECT s.* FROM mindspace_shares s JOIN users u ON u.id=s.owner_user_id AND u.status='active' WHERE s.id=? AND s.recipient_user_id=? FOR UPDATE", [(int) ($data['id'] ?? 0), $this->uid()]);
        if (!$share || $share['status'] !== 'pending') fail('error_not_found', 404);
        $status = Validate::choice($data['status'] ?? '', ['accepted', 'declined']);
        $this->db->run('UPDATE mindspace_shares SET status=?,responded_at=UTC_TIMESTAMP() WHERE id=?', [$status, $share['id']]);
        $this->notify((int) $share['owner_user_id'], 'notification_invitation_' . $status, $this->user['name']);
    }

    public function revoke(array $data, bool $leave = false): void
    {
        $this->requireSchema();
        $column = $leave ? 'recipient_user_id' : 'owner_user_id';
        $share = $this->db->one("SELECT id,status FROM mindspace_shares WHERE id=? AND $column=? FOR UPDATE", [(int) ($data['id'] ?? 0), $this->uid()]);
        if (!$share || !in_array($share['status'], $leave ? ['accepted'] : ['pending', 'accepted'], true)) fail('error_not_found', 404);
        $this->db->run("UPDATE mindspace_shares SET status='revoked',responded_at=UTC_TIMESTAMP() WHERE id=?", [$share['id']]);
    }

    public function preview(array $data): array
    {
        $this->requireSchema();
        $share = $this->db->one("SELECT s.* FROM mindspace_shares s JOIN users u ON u.id=s.owner_user_id AND u.status='active'
            WHERE s.id=? AND (s.owner_user_id=? OR (s.recipient_user_id=? AND s.status='accepted'))", [(int) ($data['id'] ?? 0), $this->uid(), $this->uid()]);
        if (!$share) fail('error_not_found', 404);
        $owner = ['id' => (int) $share['owner_user_id']];
        $model = new MindSpacesModel($this->db, $owner);
        $catalog = $model->get();
        $root = $share['item_id'] ? array_values(array_filter($catalog['items'], fn($item) => $item['id'] === $share['item_id']))[0] ?? null
            : array_values(array_filter($catalog['spaces'], fn($space) => $space['id'] === $share['space_id']))[0] ?? null;
        if (!$root) fail('error_not_found', 404);
        $items = $catalog['items'];
        if ($share['space_id']) {
            $items = array_values(array_filter($items, fn($item) => $item['mindspace_id'] === $share['space_id']));
        } else {
            $allowed = [$root['id'] => true];
            do {
                $count = count($allowed);
                foreach ($items as $item) if (isset($allowed[$item['parent_id']])) $allowed[$item['id']] = true;
            } while ($count !== count($allowed));
            $items = array_values(array_filter($items, fn($item) => isset($allowed[$item['id']])));
        }
        // A preview never broadens the recipient's private editor catalog or grants write access.
        $selectedId = isset($data['item_id']) ? (int) $data['item_id'] : ($share['item_id'] ? (int) $share['item_id'] : null);
        $selected = $selectedId ? array_values(array_filter($items, fn($item) => $item['id'] === $selectedId))[0] ?? null : null;
        if ($selectedId && !$selected) fail('error_not_found', 404);
        $result = ['name' => $root['name'], 'root_id' => $share['item_id'], 'items' => array_map(static fn($item) => array_intersect_key($item, array_flip(['id','parent_id','kind','name'])), $items), 'selected' => null];
        if ($selected) {
            $result['selected'] = array_intersect_key($selected, array_flip(['id','parent_id','kind','name','content']));
            if ($selected['kind'] === 'diagram') {
                $diagram = (new DiagramsModel($this->db, $owner))->list((int) $selected['diagram_id'])[0] ?? null;
                if (!$diagram) fail('error_not_found', 404);
                foreach ($diagram['nodes'] as &$node) unset($node['link']);
                $result['selected']['diagram'] = $diagram;
            } elseif ($selected['kind'] === 'habits') {
                $ids = $selected['content']['habit_ids'];
                $result['selected']['habits'] = $ids ? $this->db->all('SELECT id,name,description,goal,unit FROM habits WHERE owner_user_id=? AND id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', array_merge([$owner['id']], $ids)) : [];
            }
        }
        return $result;
    }
}
