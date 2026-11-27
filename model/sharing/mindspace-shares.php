<?php
declare(strict_types=1);

final class MindSpaceShares extends BaseModel
{
    private const RIGHTS = ['edit', 'move', 'delete', 'share'];

    public function available(): bool
    {
        return (bool) $this->db->one("SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='mindspace_shares' AND column_name='can_edit'");
    }
    private function requireSchema(): void { if (!$this->available()) fail('error_mindspace_sharing_setup', 503); }
    private static function permissions(array $row): array
    {
        return array_combine(self::RIGHTS, array_map(static fn($right) => !empty($row['can_' . $right]), self::RIGHTS));
    }
    private static function requested(array $data): array
    {
        $permissions = $data['permissions'] ?? [];
        if (!is_array($permissions) || array_diff(array_keys($permissions), self::RIGHTS)) fail('error_validation');
        $result = [];
        foreach (self::RIGHTS as $right) {
            $value = $permissions[$right] ?? false;
            if (!is_bool($value) && !in_array($value, [0, 1], true)) fail('error_validation');
            $result[$right] = (bool) $value;
        }
        return $result;
    }
    private function row(int $id, bool $lock = false): ?array
    {
        return $this->db->one("SELECT s.* FROM mindspace_shares s JOIN users owner ON owner.id=s.owner_user_id AND owner.status='active'
            JOIN users inviter ON inviter.id=s.inviter_user_id AND inviter.status='active'
            LEFT JOIN users recipient ON recipient.id=s.recipient_user_id
            WHERE s.id=? AND (s.recipient_user_id IS NULL OR recipient.status='active')" . ($lock ? ' FOR UPDATE' : ''), [$id]);
    }
    private function scope(array $share): array
    {
        $owner = $this->db->one('SELECT u.id,u.name,u.email,s.timezone,s.language FROM users u JOIN user_settings s ON s.user_id=u.id WHERE u.id=?', [$share['owner_user_id']]);
        if (!$owner) fail('error_not_found', 404);
        $catalog = (new MindSpacesModel($this->db, $owner))->get();
        $root = $share['item_id'] ? array_values(array_filter($catalog['items'], fn($item) => $item['id'] === $share['item_id']))[0] ?? null
            : array_values(array_filter($catalog['spaces'], fn($space) => $space['id'] === $share['space_id']))[0] ?? null;
        if (!$root) fail('error_not_found', 404);
        $items = $catalog['items'];
        if ($share['space_id']) $items = array_values(array_filter($items, fn($item) => $item['mindspace_id'] === $share['space_id']));
        else {
            $allowed = [$root['id'] => true];
            do {
                $count = count($allowed);
                foreach ($items as $item) if (isset($allowed[$item['parent_id']])) $allowed[$item['id']] = true;
            } while ($count !== count($allowed));
            $items = array_values(array_filter($items, fn($item) => isset($allowed[$item['id']])));
        }
        $spaceId = $share['space_id'] ?: $root['mindspace_id'];
        $space = array_values(array_filter($catalog['spaces'], fn($space) => $space['id'] === $spaceId))[0];
        return compact('owner', 'root', 'items', 'space');
    }
    private function chain(array $share, array $seen = [], bool $lock = false): ?array
    {
        if (isset($seen[$share['id']]) || count($seen) >= 12) return null;
        $seen[$share['id']] = true;
        $permissions = self::permissions($share);
        if (!$share['parent_share_id']) return $share['inviter_user_id'] === $share['owner_user_id'] ? $permissions : null;
        $parent = $this->row((int) $share['parent_share_id'], $lock);
        if (!$parent || $parent['status'] !== 'accepted' || $parent['recipient_user_id'] !== $share['inviter_user_id'] || $parent['owner_user_id'] !== $share['owner_user_id']) return null;
        $inherited = $this->chain($parent, $seen, $lock);
        if (!$inherited || !$inherited['share']) return null;
        $scope = $this->scope($parent);
        if ($share['space_id'] ? $parent['space_id'] !== $share['space_id'] : !in_array($share['item_id'], array_column($scope['items'], 'id'), true)) return null;
        foreach (self::RIGHTS as $right) $permissions[$right] = $permissions[$right] && $inherited[$right];
        return $permissions;
    }
    private function workspaceAccess(int $id, bool $lock = false): array
    {
        $this->requireSchema();
        $share = $this->row($id, $lock);
        if (!$share) fail('error_not_found', 404);
        if ($lock) {
            $spaceId = $share['space_id'] ?: $this->db->one('SELECT mindspace_id FROM mindspace_items WHERE id=?', [$share['item_id']])['mindspace_id'];
            $this->db->one('SELECT id FROM mindspaces WHERE id=? FOR UPDATE', [$spaceId]);
        }
        if ((int) $share['owner_user_id'] === $this->uid()) $permissions = array_fill_keys(self::RIGHTS, true);
        elseif ((int) $share['recipient_user_id'] === $this->uid() && $share['status'] === 'accepted') $permissions = $this->chain($share, [], $lock);
        elseif ((int) $share['inviter_user_id'] === $this->uid() && $share['parent_share_id']) {
            $parent = $this->row((int) $share['parent_share_id'], $lock);
            // Opening a sent invitation must not retain access after its resource
            // leaves the folder that granted the inviter access in the first place.
            $permissions = $parent && $parent['status'] === 'accepted' && $this->chain($share, [], $lock) !== null
                ? $this->chain($parent, [], $lock) : null;
        } else $permissions = null;
        if ($permissions === null) fail('error_not_found', 404);
        return [$share, $permissions, $this->scope($share)];
    }
    public function authorizeFileLibrary(int $shareId, int $itemId, ?string $right): void
    {
        [$share, $permissions, $scope] = $this->workspaceAccess($shareId, $right !== null);
        $items = array_column($scope['items'], null, 'id');
        if (($items[$itemId]['kind'] ?? null) !== 'files') fail('error_not_found', 404);
        if ($right !== null && !$permissions[$right]) fail('error_forbidden', 403);
    }

    public function catalog(): array
    {
        if (!$this->available()) return ['outgoing' => [], 'incoming' => []];
        $select = "SELECT s.*,u.name AS owner_name,u.email AS owner_email,CASE WHEN s.status='accepted' THEN recipient.name ELSE NULL END AS recipient_name,
            COALESCE(d.name,i.name,m.name) AS resource_name,CASE WHEN s.space_id IS NOT NULL THEN 'space' ELSE i.kind END AS kind
            FROM mindspace_shares s JOIN users u ON u.id=s.inviter_user_id JOIN users owner ON owner.id=s.owner_user_id AND owner.status='active'
            LEFT JOIN users recipient ON recipient.id=s.recipient_user_id LEFT JOIN mindspaces m ON m.id=s.space_id
            LEFT JOIN mindspace_items i ON i.id=s.item_id LEFT JOIN diagrams d ON d.id=i.diagram_id";
        $result = [];
        foreach (['outgoing' => 'inviter_user_id', 'incoming' => 'recipient_user_id'] as $direction => $column) {
            $rows = $this->db->all($select . " WHERE s.$column=? AND u.status='active' ORDER BY s.created_at DESC,s.id DESC", [$this->uid()]);
            foreach ($rows as &$row) {
                $permissions = $this->chain($row);
                if ($permissions === null) $row['status'] = 'revoked';
                $row['permissions'] = $permissions ?? array_fill_keys(self::RIGHTS, false);
                $parent = $row['parent_share_id'] ? $this->row((int) $row['parent_share_id']) : null;
                $row['allowed_permissions'] = $row['parent_share_id'] ? ($parent ? $this->chain($parent) : null) ?? array_fill_keys(self::RIGHTS, false) : array_fill_keys(self::RIGHTS, true);
                $row['permission'] = in_array(true, $row['permissions'], true) ? 'editor' : 'viewer';
                $row['resource_owner_user_id'] = $row['owner_user_id'];
                $row['owner_user_id'] = $row['inviter_user_id'];
                if ($direction === 'incoming' && !in_array($row['status'], ['pending', 'accepted'], true)) $row['resource_name'] = null;
                // Account identity stays opaque until an invitation has been accepted.
                unset($row['recipient_user_id']);
            }
            unset($row);
            $result[$direction] = $rows;
        }
        return $result;
    }
    public function invite(array $data): void
    {
        $this->requireSchema();
        $type = Validate::choice($data['target'] ?? '', ['space', 'item']);
        $id = (int) ($data['id'] ?? 0); $email = Validate::email($data['email'] ?? null);
        $permissions = self::requested($data);
        $message = Validate::text($data, 'invitation_message', 1000, false);
        $parentId = null; $ownerId = $this->uid();
        if (!empty($data['source_share_id'])) {
            [$parent, $maximum, $scope] = $this->workspaceAccess((int) $data['source_share_id'], true);
            if (!$maximum['share']) fail('error_forbidden', 403);
            if ($type === 'space' ? $parent['space_id'] !== $id : !in_array($id, array_column($scope['items'], 'id'), true)) fail('error_not_found', 404);
            foreach (self::RIGHTS as $right) if ($permissions[$right] && !$maximum[$right]) fail('error_forbidden', 403);
            $ownerId = (int) $parent['owner_user_id'];
            if ($ownerId !== $this->uid()) {
                if ((int) $parent['recipient_user_id'] !== $this->uid() || $parent['status'] !== 'accepted') fail('error_forbidden', 403);
                $parentId = (int) $parent['id'];
            }
        }
        $resource = $type === 'space'
            ? $this->db->one('SELECT id FROM mindspaces WHERE id=? AND owner_user_id=? FOR UPDATE', [$id, $ownerId])
            : $this->db->one('SELECT i.id FROM mindspace_items i JOIN mindspaces m ON m.id=i.mindspace_id WHERE i.id=? AND m.owner_user_id=? FOR UPDATE', [$id, $ownerId]);
        if (!$resource) fail('error_not_found', 404);
        $space = $type === 'space' ? $id : null; $item = $type === 'item' ? $id : null;
        $existing = $this->db->one('SELECT id,status FROM mindspace_shares WHERE inviter_user_id=? AND recipient_email=? AND space_id <=> ? AND item_id <=> ? FOR UPDATE', [$this->uid(), $email, $space, $item]);
        if ($existing && in_array($existing['status'], ['pending', 'accepted'], true)) return;
        for ($cursor = $parentId, $seen = []; $cursor;) {
            if (isset($seen[$cursor]) || count($seen) >= 11 || $cursor === ($existing['id'] ?? null)) fail('error_forbidden', 403);
            $seen[$cursor] = true; $ancestor = $this->row($cursor); $cursor = $ancestor['parent_share_id'] ?? null;
        }
        $recipient = $this->db->one("SELECT u.id,COALESCE(s.language,'en') AS language FROM users u LEFT JOIN user_settings s ON s.user_id=u.id WHERE u.email=? AND u.status='active'", [$email]);
        $recipientId = $recipient && !in_array((int) $recipient['id'], [$this->uid(), $ownerId], true) ? $recipient['id'] : null;
        $flags = array_map(static fn($flag) => (int) $flag, array_values($permissions));
        if ($existing) $this->db->run("UPDATE mindspace_shares SET recipient_user_id=?,parent_share_id=?,can_edit=?,can_move=?,can_delete=?,can_share=?,status='pending',invitation_message=?,created_at=UTC_TIMESTAMP(),responded_at=NULL WHERE id=?", [$recipientId, $parentId, ...$flags, $message, $existing['id']]);
        else $this->db->run('INSERT INTO mindspace_shares(owner_user_id,inviter_user_id,recipient_user_id,recipient_email,space_id,item_id,parent_share_id,can_edit,can_move,can_delete,can_share,invitation_message) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [$ownerId, $this->uid(), $recipientId, $email, $space, $item, $parentId, ...$flags, $message]);
        $this->notify($this->uid(), 'notification_invitation_sent', $email);
        if ($recipientId) {
            $this->notify((int) $recipientId, 'notification_invitation');
            $mailer = new Mailer();
            if ($mailer->ready() && !$mailer->mindspaceInvitation($email, $recipient['language'])) error_log('MindSpace invitation saved, but its notification email could not be delivered.');
        }
    }
    public function respond(array $data): void
    {
        $this->requireSchema(); $share = $this->row((int) ($data['id'] ?? 0), true);
        if (!$share || (int) $share['recipient_user_id'] !== $this->uid() || $share['status'] !== 'pending' || $this->chain($share) === null) fail('error_not_found', 404);
        $status = Validate::choice($data['status'] ?? '', ['accepted', 'declined']);
        $this->db->run('UPDATE mindspace_shares SET status=?,responded_at=UTC_TIMESTAMP() WHERE id=?', [$status, $share['id']]);
        $this->notify((int) $share['inviter_user_id'], 'notification_invitation_' . $status, $this->user['name']);
    }
    public function revoke(array $data, bool $leave = false): void
    {
        $this->requireSchema(); $share = $this->row((int) ($data['id'] ?? 0), true);
        $allowed = $share && ($leave ? (int) $share['recipient_user_id'] === $this->uid() : in_array($this->uid(), [(int) $share['owner_user_id'], (int) $share['inviter_user_id']], true));
        if (!$allowed || !in_array($share['status'], $leave ? ['accepted'] : ['pending', 'accepted'], true)) fail('error_not_found', 404);
        $this->db->run("UPDATE mindspace_shares SET status='revoked',responded_at=UTC_TIMESTAMP() WHERE id=?", [$share['id']]);
    }
    public function change(array $data): void
    {
        [$share, $maximum] = $this->workspaceAccess((int) ($data['id'] ?? 0), true);
        if ((int) $share['inviter_user_id'] !== $this->uid() || !in_array($share['status'], ['pending', 'accepted'], true)) fail('error_not_found', 404);
        $permissions = self::requested($data);
        foreach (self::RIGHTS as $right) if ($permissions[$right] && !$maximum[$right]) fail('error_forbidden', 403);
        $this->db->run('UPDATE mindspace_shares SET can_edit=?,can_move=?,can_delete=?,can_share=? WHERE id=?', [...array_map(static fn($flag) => (int) $flag, array_values($permissions)), $share['id']]);
    }
    public function preview(array $data): array
    {
        [$share, $permissions, $scope] = $this->workspaceAccess((int) ($data['id'] ?? 0));
        $items = $scope['items']; $diagrams = []; $habitIds = [];
        foreach ($items as &$item) {
            $item['permissions'] = $permissions;
            if ($item['id'] === $share['item_id']) $item['parent_id'] = null;
            if ($item['kind'] === 'diagram') {
                $diagram = (new DiagramsModel($this->db, $scope['owner']))->list((int) $item['diagram_id'])[0] ?? null;
                if ($diagram) $diagrams[] = $diagram;
            }
            if ($item['kind'] === 'habits') $habitIds = array_merge($habitIds, $item['content']['habit_ids']);
        }
        unset($item);
        $habits = [];
        if ($habitIds) {
            $habits = array_values(array_filter((new Habits($this->db, $scope['owner']))->list(), fn($habit) => in_array($habit['id'], $habitIds, true)));
            foreach ($habits as &$habit) { $habit['permission'] = $permissions['edit'] ? 'editor' : 'viewer'; $habit['group'] = null; $habit['progress_consent'] = 'none'; }
            unset($habit);
        }
        $categories = $habits ? $this->db->all('SELECT * FROM habit_categories WHERE id IN (' . implode(',', array_fill(0, count($habits), '?')) . ')', array_column($habits, 'category_id')) : [];
        $completions = $habitIds ? $this->db->all('SELECT habit_id,completed_on,amount,goal_at_time,note FROM habit_completions WHERE user_id=? AND habit_id IN (' . implode(',', array_fill(0, count($habitIds), '?')) . ')', [$this->uid(), ...$habitIds]) : [];
        $space = $scope['space']; $space['permissions'] = $share['space_id'] ? $permissions : array_fill_keys(self::RIGHTS, false);
        $workspace = ['mindspace' => ['id' => $space['id'], 'name' => $space['name'], 'spaces' => [$space], 'items' => $items], 'diagrams' => $diagrams, 'habits' => $habits, 'categories' => $categories, 'routines' => [], 'completions' => $completions];
        return ['name' => $scope['root']['name'], 'root_id' => $share['item_id'], 'space_id' => $space['id'], 'permissions' => $permissions, 'workspace' => $workspace,
            'delegation_share_id' => (int) $share['inviter_user_id'] === $this->uid() && $share['parent_share_id'] ? $share['parent_share_id'] : $share['id']];
    }
    public function action(array $request): mixed
    {
        [$share, $permissions, $scope] = $this->workspaceAccess((int) ($request['share_id'] ?? 0), true);
        $action = $request['action'] ?? ''; $data = $request['data'] ?? null;
        if (!is_array($data)) fail('error_validation');
        $items = array_column($scope['items'], null, 'id');
        $id = (int) ($data['id'] ?? 0);
        $item = $items[$id] ?? null;
        $right = match ($action) {
            'getSpreadsheetInvoice' => null,
            'saveSpreadsheetInvoice', 'moveSpreadsheetRow' => 'edit',
            'saveMindSpaceItem', 'createMindSpaceItem', 'renameMindSpace', 'addMindSpaceHabit', 'saveDiagram', 'saveHabit', 'complete' => 'edit',
            'moveMindSpaceItem' => 'move', 'deleteMindSpaceItem', 'deleteMindSpace', 'deleteDiagram', 'archiveHabit' => 'delete',
            default => fail('error_not_found', 404),
        };
        if ($right !== null && !$permissions[$right]) fail('error_forbidden', 403);
        if (in_array($action, ['saveDiagram', 'deleteDiagram'], true)) {
            $item = array_values(array_filter($scope['items'], fn($row) => $row['kind'] === 'diagram' && (int) $row['diagram_id'] === $id))[0] ?? null;
            if (!$item) fail('error_not_found', 404);
            if ($action === 'saveDiagram' && isset($data['nodes'])) $this->validateLinks($data['nodes'], $scope, $id);
            return (new DiagramsModel($this->db, $scope['owner']))->{$action === 'saveDiagram' ? 'save' : 'delete'}($data);
        }
        if (in_array($action, ['saveHabit', 'complete', 'archiveHabit'], true)) {
            $habitId = (int) ($data[$action === 'complete' ? 'habit_id' : 'id'] ?? 0);
            $habitIds = array_merge([], ...array_map(static fn($row) => $row['kind'] === 'habits' ? $row['content']['habit_ids'] : [], $scope['items']));
            if (!in_array($habitId, $habitIds, true)) fail('error_not_found', 404);
            $model = new Habits($this->db, $this->user);
            $joined = (new DateTimeImmutable($share['responded_at'] ?? $share['created_at'], new DateTimeZone('UTC')))->setTimezone(new DateTimeZone($this->user['timezone']))->format('Y-m-d');
            $model->authorizeWorkspaceHabit($habitId, $action === 'archiveHabit' ? 'owner' : 'editor', $joined);
            return $model->{$action}($data);
        }
        if (in_array($action, ['renameMindSpace', 'deleteMindSpace'], true)) {
            if (!$share['space_id'] || $id !== (int) $share['space_id']) fail('error_not_found', 404);
        } elseif ($action === 'createMindSpaceItem') {
            if ((int) ($data['mindspace_id'] ?? 0) !== (int) $scope['space']['id']) fail('error_not_found', 404);
            $this->destination($data['parent_id'] ?? null, $share, $items);
        } else {
            if (!$item) fail('error_not_found', 404);
            if ($action === 'moveMindSpaceItem') $this->destination($data['parent_id'] ?? null, $share, $items);
            if ($action === 'addMindSpaceHabit') $data['habit']['category_id'] = 0;
            if ($action === 'saveMindSpaceItem' && $item['kind'] === 'habits' && isset($data['content']['habit_ids'])) {
                $allowed = array_merge([], ...array_map(static fn($row) => $row['kind'] === 'habits' ? $row['content']['habit_ids'] : [], $scope['items']));
                if (array_diff($data['content']['habit_ids'], $allowed)) fail('error_forbidden', 403);
            }
        }
        $method = ['createMindSpaceItem' => 'create', 'saveMindSpaceItem' => 'save', 'moveSpreadsheetRow' => 'moveSheetRow', 'getSpreadsheetInvoice' => 'invoice', 'saveSpreadsheetInvoice' => 'saveInvoice', 'moveMindSpaceItem' => 'move', 'renameMindSpace' => 'renameSpace', 'deleteMindSpace' => 'deleteSpace', 'deleteMindSpaceItem' => 'delete', 'addMindSpaceHabit' => 'addHabit'][$action];
        // Shared board editing does not authorize changing the owner's private goals.
        if (isset($data['content']['cards']) && is_array($data['content']['cards'])) {
            foreach ($data['content']['cards'] as &$card) if (is_array($card)) unset($card['goal_ids']);
            unset($card);
        }
        return (new MindSpacesModel($this->db, $scope['owner']))->{$method}($data);
    }
    private function destination(mixed $parent, array $share, array $items): void
    {
        if ($parent === null) { if (!$share['space_id']) fail('error_forbidden', 403); return; }
        if (!is_int($parent) || !isset($items[$parent]) || $items[$parent]['kind'] !== 'folder') fail('error_not_found', 404);
    }
    private function validateLinks(mixed $nodes, array $scope, int $diagramId): void
    {
        if (!is_array($nodes)) fail('error_validation');
        $original = (new DiagramsModel($this->db, $scope['owner']))->list($diagramId)[0];
        $old = array_column($original['nodes'], null, 'id');
        foreach ($nodes as $node) {
            if (!is_array($node)) fail('error_validation');
            $link = $node['link'] ?? null;
            if (!$link || $link === ($old[$node['id'] ?? '']['link'] ?? null)) continue;
            $valid = is_array($link) && (isset($link['item_id']) ? in_array($link['item_id'], array_column($scope['items'], 'id'), true)
                : in_array($link['diagram_id'] ?? null, array_column($scope['items'], 'diagram_id'), true));
            if (!$valid) fail('error_forbidden', 403);
        }
    }
}
