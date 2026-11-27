<?php
declare(strict_types=1);

final class MindSpacesModel extends BaseModel
{
    private static function boardKind(string $kind): string { return $kind === 'scrum' ? 'kanban' : $kind; }

    private static function defaultColumns(): array
    {
        // Keep the saved backlog ID so existing cards and diagram links remain valid.
        return [['id' => 'backlog', 'name' => 'Pending'],
            ['id' => 'doing', 'name' => 'In Progress'], ['id' => 'done', 'name' => 'Done']];
    }

    private static function boardColumns(mixed $columns, bool $primary = true): array
    {
        if (!is_array($columns) || !array_is_list($columns)) fail('error_validation');
        // Fold the old To Do column into Pending without removing any cards.
        if ($primary && ($columns[1]['id'] ?? null) === 'todo') array_splice($columns, 1, 1);
        if (count($columns) < 3 || count($columns) > 50) fail('error_validation');
        $defaults = self::defaultColumns(); $clean = []; $ids = []; $names = [];
        foreach ($columns as $index => $column) {
            if (!is_array($column)) fail('error_validation');
            $id = $column['id'] ?? null;
            if (!is_string($id) || isset($ids[$id])) fail('error_validation');
            if ($primary && $index < 3) {
                if ($id !== $defaults[$index]['id']) fail('error_validation');
                $name = $defaults[$index]['name'];
            } else {
                if (!preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/D', $id)) fail('error_validation');
                $name = !$primary && $index < 3 ? $defaults[$index]['name'] : Validate::text($column, 'name', 80);
            }
            $key = mb_strtolower($name);
            if (isset($names[$key])) fail('ms_column_exists');
            $ids[$id] = true; $names[$key] = true;
            $clean[] = ['id' => $id, 'name' => $name];
        }
        return $clean;
    }

    private static function sprintDetails(mixed $sprint): array
    {
        if (!is_array($sprint)) fail('error_validation');
        $start = !empty($sprint['start']) ? Validate::date($sprint['start']) : null;
        $end = !empty($sprint['end']) ? Validate::date($sprint['end']) : null;
        if ($start && $end && $end < $start) fail('error_date');
        return ['name' => self::text($sprint['name'] ?? '', 120), 'goal' => self::text($sprint['goal'] ?? '', 5000), 'start' => $start, 'end' => $end];
    }

    private static function boardSprints(mixed $sprints): array
    {
        if (!is_array($sprints) || !array_is_list($sprints) || count($sprints) > 50) fail('error_validation');
        $clean = []; $seen = [];
        foreach ($sprints as $sprint) {
            if (!is_array($sprint)) fail('error_validation');
            $id = $sprint['id'] ?? null;
            if (!is_string($id) || !preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/D', $id) || isset($seen[$id])) fail('error_validation');
            $seen[$id] = true;
            $clean[] = ['id' => $id, ...self::sprintDetails($sprint), 'columns' => self::boardColumns($sprint['columns'] ?? null, false)];
        }
        return $clean;
    }

    private static function normalizeBoard(array $content): array
    {
        $content['columns'] = array_values(array_filter($content['columns'] ?? self::defaultColumns(), fn($column) => $column['id'] !== 'todo'));
        foreach ($content['cards'] as &$card) if ($card['status'] === 'todo') $card['status'] = 'backlog';
        return $content;
    }

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
        $space = $this->db->one("SELECT id,name FROM mindspaces WHERE owner_user_id=? ORDER BY (space_key='home') DESC,id LIMIT 1" . ($lock ? ' FOR UPDATE' : ''), [$this->uid()]);
        if ($space) return $space;
        $this->db->run("INSERT INTO mindspaces(owner_user_id) VALUES (?) ON DUPLICATE KEY UPDATE id=id", [$this->uid()]);
        return $this->space($lock);
    }

    public function createSpace(array $data): array
    {
        if (!$this->available()) fail('error_mindspace_setup', 503);
        // Spaces are always siblings; only items can have a parent.
        if (isset($data['parent_id']) || isset($data['mindspace_id'])) fail('error_validation');
        $name = Validate::text($data, 'name', 120);
        $key = Validate::text($data, 'client_key', 36);
        if (!preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/D', $key)) fail('error_validation');
        $this->db->run('INSERT INTO mindspaces(owner_user_id,space_key,name) VALUES (?,?,?) ON DUPLICATE KEY UPDATE id=id', [$this->uid(), $key, $name]);
        return $this->db->one('SELECT id,name FROM mindspaces WHERE owner_user_id=? AND space_key=?', [$this->uid(), $key]);
    }

    public function get(): array
    {
        if (!$this->available()) fail('error_mindspace_setup', 503);
        $space = $this->db->one("SELECT id,name FROM mindspaces WHERE owner_user_id=? ORDER BY (space_key='home') DESC,id LIMIT 1", [$this->uid()]);
        // Adopt legacy diagrams, but never recreate a deleted space on a read.
        $orphan = $this->db->one('SELECT d.id FROM diagrams d LEFT JOIN mindspace_items i ON i.diagram_id=d.id WHERE d.owner_user_id=? AND i.id IS NULL LIMIT 1', [$this->uid()]);
        if ($orphan) {
            $space ??= $this->space();
            $this->db->run("INSERT IGNORE INTO mindspace_items(mindspace_id,kind,name,diagram_id,content_json,client_key,sort_order,created_at,updated_at)
            SELECT ?,'diagram',d.name,d.id,'{}',d.client_key,d.id,d.created_at,d.updated_at FROM diagrams d
            LEFT JOIN mindspace_items i ON i.diagram_id=d.id WHERE d.owner_user_id=? AND i.id IS NULL", [$space['id'], $this->uid()]);
        }
        $space ??= ['id' => null, 'name' => 'MindSpace'];
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
        if (!$this->available()) fail('error_mindspace_setup', 503);
        $item = $this->db->one('SELECT i.*,COALESCE(d.name,i.name) AS name,d.version AS diagram_version FROM mindspace_items i
            JOIN mindspaces m ON m.id=i.mindspace_id LEFT JOIN diagrams d ON d.id=i.diagram_id
            WHERE i.id=? AND m.owner_user_id=?' . ($lock ? ' FOR UPDATE' : ''), [$id, $this->uid()]);
        if (!$item) fail('error_not_found', 404);
        return $item;
    }

    public function renameSpace(array $data): array
    {
        $space = $this->space(true, (int) ($data['id'] ?? 0));
        $name = Validate::text($data, 'name', 120);
        $this->db->run('UPDATE mindspaces SET name=?,updated_at=UTC_TIMESTAMP() WHERE id=?', [$name, $space['id']]);
        $this->db->run('UPDATE habit_categories SET name=? WHERE source_mindspace_id=? AND owner_user_id=?', [mb_substr($name,0,100),$space['id'],$this->uid()]);
        return ['id' => $space['id'], 'name' => $name];
    }

    public function validateLink(array $link): void
    {
        if (!$this->available()) fail('error_diagram_link_missing');
        $item = $this->db->one('SELECT i.kind,i.content_json FROM mindspace_items i JOIN mindspaces m ON m.id=i.mindspace_id WHERE i.id=? AND m.owner_user_id=?', [$link['item_id'], $this->uid()]);
        if (!$item || $item['kind'] === 'diagram') fail('error_diagram_link_missing');
        $target = $link['target'];
        if ($target === null) return;
        $content = json_decode($item['content_json'], true, 32, JSON_THROW_ON_ERROR);
        $valid = false;
        if ($item['kind'] === 'spreadsheet' && $target['type'] === 'cell') {
            preg_match('/^([A-Z]+)([0-9]+)$/D', $target['id'], $parts);
            $column = 0;
            foreach (str_split($parts[1]) as $letter) $column = $column * 26 + ord($letter) - 64;
            $valid = $column <= $content['columns'] && (int) $parts[2] <= $content['rows'];
        } elseif (in_array($item['kind'], ['kanban', 'scrum'], true) && $target['type'] === 'card') {
            $valid = in_array($target['id'], array_column($content['cards'], 'id'), true);
        } elseif (in_array($item['kind'], ['kanban', 'scrum'], true) && $target['type'] === 'column') {
            $content = self::normalizeBoard($content);
            $columns = $content['columns'];
            foreach ($content['sprints'] ?? [] as $sprint) $columns = [...$columns, ...$sprint['columns']];
            $valid = in_array($target['id'] === 'todo' ? 'backlog' : $target['id'], array_column($columns, 'id'), true);
        } elseif ($item['kind'] === 'habits' && $target['type'] === 'habit') {
            $valid = in_array((int) $target['id'], $content['habit_ids'], true)
                && $this->db->one('SELECT id FROM habits WHERE id=? AND owner_user_id=?', [(int) $target['id'], $this->uid()]);
        }
        if (!$valid) fail('error_diagram_link_missing');
    }

    public function deleteSpace(array $data): array
    {
        $space = $this->space(true, (int) ($data['id'] ?? 0));
        $items = $this->db->all('SELECT id,diagram_id FROM mindspace_items WHERE mindspace_id=? FOR UPDATE', [$space['id']]);
        $this->deleteItems($items);
        $this->db->run('DELETE FROM mindspaces WHERE id=?', [$space['id']]);
        return ['id' => $space['id']];
    }

    public function delete(array $data): array
    {
        $source = $this->item((int) ($data['id'] ?? 0));
        $this->space(true, (int) $source['mindspace_id']);
        $item = $this->item((int) $source['id'], true);
        if ((int) ($data['version'] ?? 0) !== (int) $item['version']) fail('error_mindspace_conflict', 409);
        if ($item['kind'] === 'diagram' && (int) ($data['diagram_version'] ?? 0) !== (int) $item['diagram_version']) fail('error_diagram_conflict', 409);
        $all = $this->db->all('SELECT id,parent_id,diagram_id FROM mindspace_items WHERE mindspace_id=? FOR UPDATE', [$item['mindspace_id']]);
        $ids = [(int) $item['id'] => true];
        do {
            $count = count($ids);
            foreach ($all as $child) if (isset($ids[$child['parent_id']])) $ids[(int) $child['id']] = true;
        } while (count($ids) !== $count);
        $this->deleteItems(array_values(array_filter($all, static fn($child) => isset($ids[$child['id']]))));
        return ['id' => $item['id'], 'deleted_ids' => array_keys($ids)];
    }

    private function deleteItems(array $items): void
    {
        if (!$items) return;
        $ids = array_column($items, 'id');
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        // Detach the selected subtree before deleting: parent FKs are restrictive.
        $this->db->run("UPDATE mindspace_items SET parent_id=NULL WHERE id IN ($placeholders)", $ids);
        $diagrams = new DiagramsModel($this->db, $this->user);
        foreach ($items as $item) {
            if ($item['diagram_id'] === null) continue;
            $diagram = $this->db->one('SELECT id,version FROM diagrams WHERE id=? AND owner_user_id=? FOR UPDATE', [$item['diagram_id'], $this->uid()]);
            if ($diagram) $diagrams->delete($diagram);
        }
        $this->db->run("DELETE FROM mindspace_items WHERE id IN ($placeholders)", $ids);
    }

    private static function response(array $item): array
    {
        $item['content'] = json_decode($item['content_json'], true, 32, JSON_THROW_ON_ERROR);
        $item['kind'] = self::boardKind($item['kind']);
        if ($item['kind'] === 'kanban') $item['content'] = self::normalizeBoard($item['content']);
        if ($item['kind'] === 'spreadsheet') {
            $item['content']['cells'] = (object) $item['content']['cells'];
            if (isset($item['content']['cell_styles'])) $item['content']['cell_styles'] = (object) $item['content']['cell_styles'];
        }
        unset($item['content_json'], $item['client_key']);
        return $item;
    }

    public function create(array $data): array
    {
        $space = $this->space(true, $data['mindspace_id'] ?? null);
        $kind = Validate::choice($data['kind'] ?? '', ['folder','diagram','spreadsheet','kanban','scrum','habits','notes']);
        $kind = self::boardKind($kind);
        $name = Validate::text($data, 'name', 120);
        $key = Validate::text($data, 'client_key', 36);
        if (!preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/D', $key)) fail('error_validation');
        $existing = $this->db->one('SELECT id,kind FROM mindspace_items WHERE mindspace_id=? AND client_key=?', [$space['id'], $key]);
        if ($existing) {
            if (self::boardKind($existing['kind']) !== $kind) fail('error_validation');
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
            'notes' => ['text' => '', 'font' => 'edwardian', 'pages' => [['text' => '', 'date' => null, 'manual' => true]]],
            'spreadsheet' => self::newSheet($data),
            'habits' => ['habit_ids' => []],
            default => ['cards' => [], 'columns' => self::defaultColumns(), 'sprint' => ['name' => '', 'goal' => '', 'start' => null, 'end' => null]],
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
            $content = array_key_exists('content', $data) ? json_encode($this->content($item['kind'], $data['content'], json_decode($item['content_json'], true, 32, JSON_THROW_ON_ERROR)), JSON_THROW_ON_ERROR) : $item['content_json'];
        }
        if (strlen($content) > 1000000) fail('error_validation');
        $this->db->run('UPDATE mindspace_items SET name=?,kind=?,content_json=?,version=version+1,updated_at=UTC_TIMESTAMP() WHERE id=?', [$name, self::boardKind($item['kind']), $content, $item['id']]);
        if ($item['kind'] === 'folder') $this->db->run('UPDATE habit_categories SET name=? WHERE source_folder_id=? AND owner_user_id=?', [mb_substr($name,0,100),$item['id'],$this->uid()]);
        return self::response($this->item((int) $item['id']));
    }

    private static function text(mixed $value, int $max): string
    {
        if (!is_string($value) || mb_strlen($value) > $max) fail('error_validation');
        return $value;
    }

    private static function newSheet(array $data): array
    {
        $template = Validate::choice($data['template'] ?? 'blank', ['blank', 'ledger', 'budget', 'inventory', 'projects']);
        if ($template === 'blank') return ['rows' => 30, 'columns' => 10, 'cells' => new stdClass()];
        $language = Validate::choice($data['language'] ?? 'en', ['en', 'es']);
        $sheet = ['rows' => 31, 'columns' => match ($template) { 'budget' => 4, 'inventory' => 5, default => 6 },
            'template' => $template, 'template_language' => $language, 'cells' => []];
        if ($template === 'budget') {
            $categories = $language === 'es' ? ['Vivienda', 'Alimentación', 'Transporte', 'Servicios', 'Salud', 'Ocio', 'Otros']
                : ['Housing', 'Groceries', 'Transport', 'Utilities', 'Health', 'Leisure', 'Other'];
            foreach ($categories as $i => $category) $sheet['cells']['A' . ($i + 2)] = $category;
        }
        return self::sheetTemplate($sheet);
    }

    private static function sheetTemplate(array $sheet): array
    {
        $template = $sheet['template']; $spanish = $sheet['template_language'] === 'es';
        $headers = match ($template) {
            'ledger' => $spanish ? ['Fecha', 'Descripción', 'Categoría', 'Entrada', 'Salida', 'Saldo'] : ['Date', 'Description', 'Category', 'Income', 'Expense', 'Balance'],
            'budget' => $spanish ? ['Categoría', 'Presupuesto', 'Gasto real', 'Disponible'] : ['Category', 'Budget', 'Actual spending', 'Remaining'],
            'inventory' => $spanish ? ['Producto', 'Código', 'Cantidad', 'Costo unitario', 'Valor total'] : ['Item', 'SKU', 'Quantity', 'Unit cost', 'Stock value'],
            'projects' => $spanish ? ['Tarea', 'Responsable', 'Estado', 'Inicio', 'Vencimiento', 'Notas'] : ['Task', 'Owner', 'Status', 'Start date', 'Due date', 'Notes'],
        };
        if ($sheet['rows'] < 2 || $sheet['columns'] < count($headers)) fail('error_validation');
        $cells = (array) $sheet['cells'];
        foreach ($headers as $i => $header) $cells[chr(65 + $i) . '1'] = $header;
        // Keep calculated columns intact, including rows added by older clients.
        for ($row = 2; $row <= $sheet['rows']; $row++) {
            if ($template === 'ledger') $cells["F$row"] = "=SUM(D2:D$row)-SUM(E2:E$row)";
            if ($template === 'budget') $cells["D$row"] = "=B$row-C$row";
            if ($template === 'inventory') $cells["E$row"] = "=C$row*D$row";
        }
        $sheet['cells'] = (object) $cells;
        return $sheet;
    }

    private static function cellStyles(mixed $styles, int $rows, int $columns): array
    {
        if (!is_array($styles) || count($styles) > 10400) fail('error_validation');
        $clean = [];
        foreach ($styles as $key => $style) {
            if (!is_string($key) || !preg_match('/^([A-Z]{1,2})([1-9][0-9]{0,2})$/D', $key, $match) || !is_array($style)) fail('error_validation');
            $column = 0; foreach (str_split($match[1]) as $letter) $column = $column * 26 + ord($letter) - 64;
            if ($column > $columns || (int) $match[2] > $rows) fail('error_validation');
            $entry = [];
            foreach ($style as $property => $value) {
                $valid = match ($property) {
                    'background', 'color', 'border_color' => is_string($value) && preg_match('/^#[a-f0-9]{6}$/iD', $value),
                    'bold', 'italic' => is_bool($value),
                    'font_size' => in_array($value, [12,13,14,16,18,20,24], true),
                    'align' => in_array($value, ['left','center','right'], true),
                    'borders' => in_array($value, ['grid','none','all','bottom'], true),
                    default => false,
                };
                if (!$valid) fail('error_validation');
                $entry[$property] = $value;
            }
            if ($entry) $clean[$key] = $entry;
        }
        return $clean;
    }

    private static function noteContent(array $data): array
    {
        $font = Validate::choice($data['font'] ?? 'edwardian', ['edwardian', 'roboto']);
        // Old clients and existing notes may still send a single text field.
        if (!array_key_exists('pages', $data)) return ['text' => self::text($data['text'] ?? '', 200000), 'font' => $font];
        if (!is_array($data['pages']) || !array_is_list($data['pages']) || !count($data['pages']) || count($data['pages']) > 20000) fail('error_validation');
        $pages = []; $text = ''; $length = 0;
        foreach ($data['pages'] as $index => $page) {
            if (!is_array($page)) fail('error_validation');
            $body = self::text($page['text'] ?? '', 200000);
            $date = $page['date'] ?? null;
            if ($date !== null) {
                $date = Validate::date($date);
                if ($date < '1000-01-01' || $date > '9998-12-31') fail('error_date');
            }
            $manual = $page['manual'] ?? false;
            if (!is_bool($manual)) fail('error_validation');
            if ($index === 0 || $date !== null) $manual = true;
            $separator = $index && $manual && (!str_ends_with($text, "\n") || $pages[$index-1]['text'] === '') && !str_starts_with($body, "\n") ? "\n" : '';
            $length += mb_strlen($body) + strlen($separator);
            if ($length > 200000) fail('error_validation');
            $text .= $separator . $body;
            $pages[] = ['text' => $body, 'date' => $date, 'manual' => $manual];
        }
        return ['text' => $text, 'font' => $font, 'pages' => $pages];
    }

    private function content(string $kind, mixed $data, array $existing = []): array
    {
        if (!is_array($data)) fail('error_validation');
        if ($kind === 'folder') return [];
        if ($kind === 'notes') return self::noteContent($data);
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
            $sheet = ['rows' => $rows, 'columns' => $columns, 'cells' => (object) $clean];
            $styles = self::cellStyles(array_key_exists('cell_styles', $data) ? $data['cell_styles'] : ($existing['cell_styles'] ?? []), $rows, $columns);
            if ($styles) $sheet['cell_styles'] = (object) $styles;
            $template = $existing['template'] ?? 'blank';
            if (array_key_exists('template', $data) && $data['template'] !== $template) fail('error_validation');
            if ($template === 'blank') return $sheet;
            $sheet['template'] = $template;
            $sheet['template_language'] = $existing['template_language'];
            return self::sheetTemplate($sheet);
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
        // Clients that omit columns must not erase columns added in a newer editor.
        // An explicit null removes the original sprint without changing the IDs
        // of remaining sprints, their columns or links to them.
        $primary = array_key_exists('sprint', $data) ? $data['sprint'] : (array_key_exists('sprint', $existing) ? $existing['sprint'] : []);
        $columns = array_key_exists('columns', $data) ? $data['columns'] : ($existing['columns'] ?? self::defaultColumns());
        if ($primary === null) {
            if ($columns !== []) fail('error_validation');
        } else {
            $columns = self::boardColumns($columns);
            $primary = self::sprintDetails($primary);
        }
        $sprints = self::boardSprints(array_key_exists('sprints', $data) ? $data['sprints'] : ($existing['sprints'] ?? []));
        if (count($sprints) + ($primary === null ? 0 : 1) > 50) fail('error_validation');
        $statuses = array_column($columns, 'id');
        foreach ($sprints as $sprint) $statuses = [...$statuses, ...array_column($sprint['columns'], 'id')];
        if (count(array_unique($statuses)) !== count($statuses)) fail('error_validation');
        $clean = []; $seen = [];
        foreach ($cards as $card) {
            if (!is_array($card)) fail('error_validation');
            $id = self::text($card['id'] ?? '', 36);
            if (!preg_match('/^[a-f0-9-]{36}$/D', $id) || isset($seen[$id])) fail('error_validation');
            $seen[$id] = true;
            $points = $card['points'] ?? 0;
            if (!is_int($points) || $points < 0 || $points > 999) fail('error_validation');
            $clean[] = ['id' => $id, 'title' => Validate::text($card, 'title', 190), 'description' => self::text($card['description'] ?? '', 5000),
                'status' => Validate::choice(($card['status'] ?? '') === 'todo' ? 'backlog' : ($card['status'] ?? ''), $statuses), 'points' => $points];
        }
        return ['cards' => $clean, 'columns' => $columns, 'sprint' => $primary, ...($sprints ? ['sprints' => $sprints] : [])];
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
