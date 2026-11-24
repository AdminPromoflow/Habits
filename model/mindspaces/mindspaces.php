<?php
declare(strict_types=1);

final class MindSpacesModel extends BaseModel
{
    public function available(): bool
    {
        // Keep the existing editor usable until both MindSpace migrations are installed.
        static $ready = [];
        $key = spl_object_id($this->db);
        return $ready[$key] ??= (bool) $this->db->one("SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='mindspace_items' AND column_name='parent_id'");
    }

    private function space(bool $lock = false, mixed $id = null): array
    {
        if (!$this->available()) fail('error_mindspace_setup', 503);
        if ($id !== null) {
            if (!is_int($id) || $id < 1) fail('error_validation');
            $space = $this->db->one('SELECT id,name FROM mindspaces WHERE id=? AND owner_user_id=?' . ($lock ? ' FOR UPDATE' : ''), [$id, $this->uid()]);
            if (!$space) fail('error_not_found', 404);
            return $space;
        }
        $this->db->run("INSERT INTO mindspaces(owner_user_id) VALUES (?) ON DUPLICATE KEY UPDATE id=id", [$this->uid()]);
        return $this->db->one("SELECT id,name FROM mindspaces WHERE owner_user_id=? AND space_key='home'" . ($lock ? ' FOR UPDATE' : ''), [$this->uid()]);
    }

    public function createSpace(array $data): array
    {
        $this->space();
        $name = Validate::text($data, 'name', 120);
        $key = Validate::text($data, 'client_key', 36);
        if (!preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/D', $key)) fail('error_validation');
        $this->db->run('INSERT INTO mindspaces(owner_user_id,space_key,name) VALUES (?,?,?) ON DUPLICATE KEY UPDATE id=id', [$this->uid(), $key, $name]);
        return $this->db->one('SELECT id,name FROM mindspaces WHERE owner_user_id=? AND space_key=?', [$this->uid(), $key]);
    }

    public function get(): array
    {
        $space = $this->space();
        $this->db->run("INSERT IGNORE INTO mindspace_items(mindspace_id,kind,name,diagram_id,content_json,client_key,sort_order,created_at,updated_at)
            SELECT ?,'diagram',d.name,d.id,'{}',d.client_key,d.id,d.created_at,d.updated_at FROM diagrams d
            LEFT JOIN mindspace_items i ON i.diagram_id=d.id WHERE d.owner_user_id=? AND i.id IS NULL", [$space['id'], $this->uid()]);
        $space['items'] = array_map(self::response(...), $this->db->all(
            'SELECT i.*,COALESCE(d.name,i.name) AS name,d.version AS diagram_version FROM mindspace_items i JOIN mindspaces m ON m.id=i.mindspace_id LEFT JOIN diagrams d ON d.id=i.diagram_id WHERE m.owner_user_id=? ORDER BY i.sort_order,i.id', [$this->uid()]));
        $space['spaces'] = $this->db->all("SELECT id,name FROM mindspaces WHERE owner_user_id=? ORDER BY (space_key='home') DESC,name,id", [$this->uid()]);
        return $space;
    }

    public function attachDiagram(int $id): ?int
    {
        if (!$this->available()) return null;
        $diagram = $this->db->one('SELECT id,name,client_key FROM diagrams WHERE id=? AND owner_user_id=?', [$id, $this->uid()]);
        if (!$diagram) fail('error_not_found', 404);
        $existing = $this->db->one('SELECT id FROM mindspace_items WHERE diagram_id=?', [$id]);
        if ($existing) return (int) $existing['id'];
        $space = $this->space(true);
        $order = $this->nextOrder((int) $space['id']);
        $this->db->run("INSERT INTO mindspace_items(mindspace_id,kind,name,diagram_id,content_json,client_key,sort_order) VALUES (?,'diagram',?,?,'{}',?,?)",
            [$space['id'], $diagram['name'], $id, $diagram['client_key'], $order]);
        return $this->db->id();
    }

    private function nextOrder(int $space): int
    {
        return (int) $this->db->one('SELECT COALESCE(MAX(sort_order),0)+1 AS next_order FROM mindspace_items WHERE mindspace_id=?', [$space])['next_order'];
    }

    private function item(int $id, bool $lock = false): array
    {
        $this->space();
        $item = $this->db->one('SELECT i.*,COALESCE(d.name,i.name) AS name,d.version AS diagram_version FROM mindspace_items i
            JOIN mindspaces m ON m.id=i.mindspace_id LEFT JOIN diagrams d ON d.id=i.diagram_id
            WHERE i.id=? AND m.owner_user_id=?' . ($lock ? ' FOR UPDATE' : ''), [$id, $this->uid()]);
        if (!$item) fail('error_not_found', 404);
        return $item;
    }

    private static function response(array $item): array
    {
        $item['content'] = json_decode($item['content_json'], true, 32, JSON_THROW_ON_ERROR);
        if ($item['kind'] === 'spreadsheet') $item['content']['cells'] = (object) $item['content']['cells'];
        unset($item['content_json'], $item['client_key']);
        return $item;
    }

    public function create(array $data): array
    {
        $space = $this->space(true, $data['mindspace_id'] ?? null);
        $kind = Validate::choice($data['kind'] ?? '', ['folder','diagram','spreadsheet','kanban','scrum','habits','notes']);
        $name = Validate::text($data, 'name', 120);
        $key = Validate::text($data, 'client_key', 36);
        if (!preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/D', $key)) fail('error_validation');
        $existing = $this->db->one('SELECT id,kind FROM mindspace_items WHERE mindspace_id=? AND client_key=?', [$space['id'], $key]);
        if ($existing) {
            if ($existing['kind'] !== $kind) fail('error_validation');
            return self::response($this->item((int) $existing['id']));
        }
        $parent = $this->parent($data['parent_id'] ?? null, null, (int) $space['id']);
        if ($kind === 'diagram') {
            $prior = $this->db->one('SELECT i.mindspace_id FROM diagrams d JOIN mindspace_items i ON i.diagram_id=d.id WHERE d.owner_user_id=? AND d.client_key=?', [$this->uid(), $key]);
            if ($prior && (int) $prior['mindspace_id'] !== (int) $space['id']) fail('error_validation');
            $diagram = (new DiagramsModel($this->db, $this->user))->save(['name' => $name, 'client_key' => $key,
                'nodes' => [['id' => 'root', 'parent_id' => null, 'text' => '']]]);
            $this->db->run('UPDATE mindspace_items SET mindspace_id=?,parent_id=?,sort_order=? WHERE id=?', [$space['id'], $parent, $this->nextOrder((int) $space['id']), $diagram['mindspace_item_id']]);
            return self::response($this->item((int) $diagram['mindspace_item_id']));
        }
        $content = match ($kind) {
            'folder' => new stdClass(),
            'notes' => ['text' => ''],
            'spreadsheet' => ['rows' => 30, 'columns' => 10, 'cells' => new stdClass()],
            'habits' => ['habit_ids' => []],
            default => ['cards' => [], 'sprint' => ['name' => '', 'goal' => '', 'start' => null, 'end' => null]],
        };
        $this->db->run('INSERT INTO mindspace_items(mindspace_id,parent_id,kind,name,content_json,client_key,sort_order) VALUES (?,?,?,?,?,?,?)',
            [$space['id'], $parent, $kind, $name, json_encode($content, JSON_THROW_ON_ERROR), $key, $this->nextOrder((int) $space['id'])]);
        return self::response($this->item($this->db->id()));
    }

    public function save(array $data): array
    {
        $item = $this->item((int) ($data['id'] ?? 0), true);
        if ((int) ($data['version'] ?? 0) !== (int) $item['version']) fail('error_mindspace_conflict', 409);
        $name = array_key_exists('name', $data) ? Validate::text($data, 'name', 120) : $item['name'];
        if ($item['kind'] === 'diagram') {
            if (array_key_exists('content', $data)) fail('error_validation');
            (new DiagramsModel($this->db, $this->user))->save(['id' => $item['diagram_id'], 'name' => $name, 'version' => (int) ($data['diagram_version'] ?? 0)]);
            $content = $item['content_json'];
        } else {
            $content = array_key_exists('content', $data) ? json_encode($this->content($item['kind'], $data['content']), JSON_THROW_ON_ERROR) : $item['content_json'];
        }
        if (strlen($content) > 1000000) fail('error_validation');
        $this->db->run('UPDATE mindspace_items SET name=?,content_json=?,version=version+1,updated_at=UTC_TIMESTAMP() WHERE id=?', [$name, $content, $item['id']]);
        return self::response($this->item((int) $item['id']));
    }

    private static function text(mixed $value, int $max): string
    {
        if (!is_string($value) || mb_strlen($value) > $max) fail('error_validation');
        return $value;
    }

    private function content(string $kind, mixed $data): array
    {
        if (!is_array($data)) fail('error_validation');
        if ($kind === 'folder') return [];
        if ($kind === 'notes') return ['text' => self::text($data['text'] ?? '', 200000)];
        if ($kind === 'spreadsheet') {
            $rows = $data['rows'] ?? null; $columns = $data['columns'] ?? null; $cells = $data['cells'] ?? null;
            if (!is_int($rows) || $rows < 1 || $rows > 200 || !is_int($columns) || $columns < 1 || $columns > 52 || !is_array($cells) || count($cells) > 10400) fail('error_validation');
            $clean = [];
            foreach ($cells as $key => $value) {
                if (!is_string($key) || !preg_match('/^([A-Z]{1,2})([1-9][0-9]{0,2})$/D', $key, $m)) fail('error_validation');
                $col = 0; foreach (str_split($m[1]) as $letter) $col = $col * 26 + ord($letter) - 64;
                if ($col > $columns || (int) $m[2] > $rows) fail('error_validation');
                $value = self::text($value, 2000);
                if ($value !== '') $clean[$key] = $value;
            }
            return ['rows' => $rows, 'columns' => $columns, 'cells' => (object) $clean];
        }
        if ($kind === 'habits') {
            $ids = $data['habit_ids'] ?? null;
            if (!is_array($ids) || !array_is_list($ids) || count($ids) > 500) fail('error_validation');
            foreach ($ids as $id) {
                if (!is_int($id) || !$this->db->one('SELECT id FROM habits WHERE id=? AND owner_user_id=?', [$id, $this->uid()])) fail('error_validation');
            }
            return ['habit_ids' => array_values(array_unique($ids))];
        }
        $cards = $data['cards'] ?? null;
        if (!is_array($cards) || !array_is_list($cards) || count($cards) > 300) fail('error_validation');
        $clean = []; $seen = [];
        foreach ($cards as $card) {
            if (!is_array($card)) fail('error_validation');
            $id = self::text($card['id'] ?? '', 36);
            if (!preg_match('/^[a-f0-9-]{36}$/D', $id) || isset($seen[$id])) fail('error_validation');
            $seen[$id] = true;
            $points = $card['points'] ?? 0;
            if (!is_int($points) || $points < 0 || $points > 999) fail('error_validation');
            $clean[] = ['id' => $id, 'title' => Validate::text($card, 'title', 190), 'description' => self::text($card['description'] ?? '', 5000),
                'status' => Validate::choice($card['status'] ?? '', $kind === 'scrum' ? ['backlog','todo','doing','done'] : ['todo','doing','done']), 'points' => $points];
        }
        $sprint = $data['sprint'] ?? [];
        if (!is_array($sprint)) fail('error_validation');
        $start = !empty($sprint['start']) ? Validate::date($sprint['start']) : null;
        $end = !empty($sprint['end']) ? Validate::date($sprint['end']) : null;
        if ($start && $end && $end < $start) fail('error_date');
        return ['cards' => $clean, 'sprint' => ['name' => self::text($sprint['name'] ?? '', 120), 'goal' => self::text($sprint['goal'] ?? '', 5000), 'start' => $start, 'end' => $end]];
    }

    public function addHabit(array $data): array
    {
        $item = $this->item((int) ($data['id'] ?? 0), true);
        if ($item['kind'] !== 'habits') fail('error_validation');
        if ((int) ($data['version'] ?? 0) !== (int) $item['version']) fail('error_mindspace_conflict', 409);
        $habit = $data['habit'] ?? null;
        if (!is_array($habit) || !empty($habit['id'])) fail('error_validation');
        if (empty($habit['category_id'])) {
            $name = mb_substr($item['name'], 0, 100);
            $category = $this->db->one('SELECT id FROM habit_categories WHERE owner_user_id=? AND name=?', [$this->uid(), $name]);
            $habit['category_id'] = $category ? (int) $category['id'] : (new CategoriesModel($this->db, $this->user))->saveCategory(['name' => $name]);
        }
        $habitId = (new Habits($this->db, $this->user))->saveHabit($habit);
        $content = json_decode($item['content_json'], true, 32, JSON_THROW_ON_ERROR);
        $content['habit_ids'][] = $habitId;
        return $this->save(['id' => $item['id'], 'version' => $item['version'], 'content' => $content]);
    }

    private function parent(mixed $parent, ?int $moving = null, ?int $space = null): ?int
    {
        if ($parent === null) return null;
        if (!is_int($parent) || $parent < 1) fail('error_validation');
        $cursor = $parent; $seen = [];
        while ($cursor !== null) {
            if ($cursor === $moving || isset($seen[$cursor])) fail('error_mindspace_move');
            $seen[$cursor] = true;
            $folder = $this->item($cursor);
            if ($space !== null && (int) $folder['mindspace_id'] !== $space) fail('error_mindspace_destination');
            if ($folder['kind'] !== 'folder') fail('error_mindspace_move');
            $cursor = $folder['parent_id'] === null ? null : (int) $folder['parent_id'];
        }
        return $parent;
    }

    public function move(array $data): array
    {
        // Serialize moves and creations in this MindSpace so concurrent folder
        // moves cannot each validate against a stale tree and create a cycle.
        $source = $this->item((int) ($data['id'] ?? 0));
        $space = $this->space(true, (int) $source['mindspace_id']);
        $item = $this->item((int) ($data['id'] ?? 0), true);
        if ((int) ($data['version'] ?? 0) !== (int) $item['version']) fail('error_mindspace_conflict', 409);
        if (!array_key_exists('parent_id', $data)) fail('error_validation');
        $parent = $this->parent($data['parent_id'], (int) $item['id'], (int) $space['id']);
        $this->db->run('UPDATE mindspace_items SET parent_id=?,sort_order=?,version=version+1,updated_at=UTC_TIMESTAMP() WHERE id=?',
            [$parent, $this->nextOrder((int) $space['id']), $item['id']]);
        return self::response($this->item((int) $item['id']));
    }
}
