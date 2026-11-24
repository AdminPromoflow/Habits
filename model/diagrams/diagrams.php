<?php
declare(strict_types=1);

final class DiagramsModel extends BaseModel
{
    public function list(): array
    {
        $diagrams = $this->db->all(
            'SELECT id,name,version,created_at,updated_at FROM diagrams WHERE owner_user_id=? ORDER BY updated_at DESC,id DESC',
            [$this->uid()],
        );
        $nodes = $this->db->all(
            'SELECT n.* FROM diagram_nodes n JOIN diagrams d ON d.id=n.diagram_id WHERE d.owner_user_id=? ORDER BY n.diagram_id,n.sort_order',
            [$this->uid()],
        );
        $byDiagram = [];
        foreach ($nodes as $node) $byDiagram[$node['diagram_id']][] = self::nodeResponse($node);
        foreach ($diagrams as &$diagram) $diagram['nodes'] = $byDiagram[$diagram['id']] ?? [];
        return $diagrams;
    }

    public function save(array $data): array
    {
        $name = self::name($data, 'name');
        $nodes = array_key_exists('nodes', $data) ? self::validateNodes($data['nodes'], $name) : null;
        $id = (int) ($data['id'] ?? 0);
        $writeNodes = true;
        if ($id) {
            $diagram = $this->db->one('SELECT id,version FROM diagrams WHERE id=? AND owner_user_id=? FOR UPDATE', [$id, $this->uid()]);
            if (!$diagram) fail('error_not_found', 404);
            if ((int) ($data['version'] ?? 0) !== (int) $diagram['version']) fail('error_diagram_conflict', 409);
            $this->db->run('UPDATE diagrams SET name=?,version=version+1,updated_at=UTC_TIMESTAMP() WHERE id=? AND owner_user_id=?', [$name, $id, $this->uid()]);
        } else {
            $key = Validate::text($data, 'client_key', 64);
            if (!preg_match('/^[a-f0-9-]{36}$/D', $key)) fail('error_validation');
            $existing = $this->db->one('SELECT id FROM diagrams WHERE owner_user_id=? AND client_key=? FOR UPDATE', [$this->uid(), $key]);
            if ($existing) {
                // A repeated creation must not replace the already saved tree.
                $id = (int) $existing['id'];
                $writeNodes = false;
            } else {
                $this->db->run('INSERT INTO diagrams(owner_user_id,name,client_key) VALUES (?,?,?)', [$this->uid(), $name, $key]);
                $id = $this->db->id();
                $nodes ??= [self::rootNode($name)];
            }
        }
        if ($writeNodes) {
            if ($nodes !== null) $this->replaceNodes($id, $nodes);
            else {
                // Older clients may rename a diagram without supplying its tree.
                $this->db->run("UPDATE diagram_nodes SET text=? WHERE diagram_id=? AND node_key='root'", [$name, $id]);
            }
        }
        $diagram = $this->db->one('SELECT id,name,version,created_at,updated_at FROM diagrams WHERE id=? AND owner_user_id=?', [$id, $this->uid()]);
        $diagram['nodes'] = array_map(self::nodeResponse(...), $this->db->all('SELECT * FROM diagram_nodes WHERE diagram_id=? ORDER BY sort_order', [$id]));
        return $diagram;
    }

    private static function name(array $data, string $key): string
    {
        // Keep deliberate newlines, including blank first and last lines.
        return preg_replace('/^[^\S\r\n]+|[^\S\r\n]+$/u', '', Validate::text($data, $key, 120));
    }

    private static function rootNode(string $name): array
    {
        return ['id' => 'root', 'parent_id' => null, 'text' => $name, 'layout' => null, 'x' => null, 'y' => null];
    }

    private static function validateNodes(mixed $input, string $name): array
    {
        if (!is_array($input) || !array_is_list($input) || count($input) < 1 || count($input) > 200) fail('error_validation');
        $nodes = [];
        foreach ($input as $item) {
            if (!is_array($item)) fail('error_validation');
            $id = $item['id'] ?? null;
            if (!is_string($id) || ($id !== 'root' && !preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/D', $id)) || isset($nodes[$id])) fail('error_validation');
            if (!array_key_exists('parent_id', $item)) fail('error_validation');
            $parent = $item['parent_id'];
            if (($id === 'root' && $parent !== null) || ($id !== 'root' && !is_string($parent))) fail('error_validation');
            $text = self::name($item, 'text');
            if ($id === 'root' && $text !== $name) fail('error_validation');
            $layout = $item['layout'] ?? null;
            if ($layout !== null) {
                if (!is_array($layout)) fail('error_validation');
                $layout = [
                    'mode' => Validate::choice($layout['mode'] ?? null, ['free','horizontal','vertical','list','topdown','linear','radial','matrix']),
                    'direction' => Validate::choice($layout['direction'] ?? 'auto', ['auto','clockwise','left','right','top','bottom','manual']),
                    'vertical' => Validate::choice($layout['vertical'] ?? 'auto', ['auto','compact','alternating','top','bottom']),
                    'horizontal' => Validate::choice($layout['horizontal'] ?? 'auto', ['auto','ltr','rtl']),
                ];
            }
            $node = ['id' => $id, 'parent_id' => $parent, 'text' => $text, 'layout' => $layout];
            foreach (['x','y'] as $axis) {
                $value = $item[$axis] ?? null;
                if ($value !== null && ((!is_int($value) && !is_float($value)) || !is_finite((float) $value) || abs($value) > 1000000)) fail('error_validation');
                $node[$axis] = $value === null ? null : round((float) $value, 2);
            }
            $nodes[$id] = $node;
        }
        if (!isset($nodes['root'])) fail('error_validation');
        foreach ($nodes as $node) {
            $seen = [];
            $cursor = $node;
            $depth = 0;
            while ($cursor['id'] !== 'root') {
                if (isset($seen[$cursor['id']]) || ++$depth > 30 || !isset($nodes[$cursor['parent_id']])) fail('error_validation');
                $seen[$cursor['id']] = true;
                $cursor = $nodes[$cursor['parent_id']];
            }
        }
        return array_values($nodes);
    }

    private function replaceNodes(int $id, array $nodes): void
    {
        // Detach old edges first: immediate SQL foreign keys also protect deep trees.
        $this->db->run('UPDATE diagram_nodes SET parent_key=NULL WHERE diagram_id=?', [$id]);
        $this->db->run('DELETE FROM diagram_nodes WHERE diagram_id=?', [$id]);
        foreach ($nodes as $position => $node) {
            $layout = $node['layout'];
            $this->db->run(
                'INSERT INTO diagram_nodes(diagram_id,node_key,parent_key,text,sort_order,layout_mode,layout_direction,layout_vertical,layout_horizontal,position_x,position_y) VALUES (?,?,NULL,?,?,?,?,?,?,?,?)',
                [$id, $node['id'], $node['text'], $position, $layout['mode'] ?? null, $layout['direction'] ?? null, $layout['vertical'] ?? null, $layout['horizontal'] ?? null, $node['x'], $node['y']],
            );
        }
        foreach ($nodes as $node) {
            if ($node['parent_id'] !== null) $this->db->run('UPDATE diagram_nodes SET parent_key=? WHERE diagram_id=? AND node_key=?', [$node['parent_id'], $id, $node['id']]);
        }
    }

    private static function nodeResponse(array $node): array
    {
        return [
            'id' => $node['node_key'], 'parent_id' => $node['parent_key'], 'text' => $node['text'],
            'layout' => $node['layout_mode'] === null ? null : [
                'mode' => $node['layout_mode'], 'direction' => $node['layout_direction'],
                'vertical' => $node['layout_vertical'], 'horizontal' => $node['layout_horizontal'],
            ],
            'x' => $node['position_x'] === null ? null : (float) $node['position_x'],
            'y' => $node['position_y'] === null ? null : (float) $node['position_y'],
        ];
    }
}
