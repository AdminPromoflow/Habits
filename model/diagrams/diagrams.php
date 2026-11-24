<?php
declare(strict_types=1);

final class DiagramsModel extends BaseModel
{
    public function list(): array
    {
        $mindspace = (new MindSpacesModel($this->db, $this->user))->available();
        $diagrams = $this->db->all(
            'SELECT d.id,d.name,d.version,d.created_at,d.updated_at,d.connections_json,' . ($mindspace ? 'i.id' : 'NULL') . ' AS mindspace_item_id FROM diagrams d ' .
            ($mindspace ? 'LEFT JOIN mindspace_items i ON i.diagram_id=d.id ' : '') .
            'WHERE d.owner_user_id=? ORDER BY d.updated_at DESC,d.id DESC',
            [$this->uid()],
        );
        $nodes = $this->db->all(
            'SELECT n.* FROM diagram_nodes n JOIN diagrams d ON d.id=n.diagram_id WHERE d.owner_user_id=? ORDER BY n.diagram_id,n.sort_order',
            [$this->uid()],
        );
        $byDiagram = [];
        foreach ($nodes as $node) $byDiagram[$node['diagram_id']][] = self::nodeResponse($node);
        foreach ($diagrams as &$diagram) {
            $diagram['nodes'] = $byDiagram[$diagram['id']] ?? [];
            $diagram = self::diagramResponse($diagram);
        }
        return $diagrams;
    }

    public function save(array $data): array
    {
        $name = self::name($data, 'name');
        $nodes = array_key_exists('nodes', $data) ? self::validateNodes($data['nodes']) : null;
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
        // The diagram title and the central idea are independent. A title-only
        // update preserves every node, including the root text and its styling.
        if ($writeNodes && $nodes !== null) $this->replaceNodes($id, $nodes);
        if ($writeNodes && ($nodes !== null || array_key_exists('connections', $data) || array_key_exists('hidden_connections', $data) || array_key_exists('connection_styles', $data))) $this->saveConnections($id, $data);
        $diagram = $this->db->one('SELECT id,name,version,created_at,updated_at,connections_json FROM diagrams WHERE id=? AND owner_user_id=?', [$id, $this->uid()]);
        $diagram['nodes'] = array_map(self::nodeResponse(...), $this->db->all('SELECT * FROM diagram_nodes WHERE diagram_id=? ORDER BY sort_order', [$id]));
        $diagram['mindspace_item_id'] = (new MindSpacesModel($this->db, $this->user))->attachDiagram($id);
        return self::diagramResponse($diagram);
    }

    private static function diagramResponse(array $diagram): array
    {
        $state = self::connectionState($diagram['connections_json']);
        $diagram['connections'] = $state['extra'];
        $diagram['hidden_connections'] = $state['hidden'];
        $diagram['connection_styles'] = $state['styles'];
        unset($diagram['connections_json']);
        return $diagram;
    }

    private static function connectionState(?string $json): array
    {
        $state = json_decode($json ?? '[]', true, 8, JSON_THROW_ON_ERROR);
        // The first release stored only the extra lines as a JSON list.
        return array_is_list($state) ? ['extra' => $state, 'hidden' => [], 'styles' => []] : $state + ['styles' => []];
    }

    private function saveConnections(int $id, array $data): void
    {
        $stored = self::connectionState($this->db->one('SELECT connections_json FROM diagrams WHERE id=?', [$id])['connections_json']);
        $parents = array_column($this->db->all('SELECT node_key,parent_key FROM diagram_nodes WHERE diagram_id=?', [$id]), 'parent_key', 'node_key');
        $state = [];
        foreach (['extra' => 'connections', 'hidden' => 'hidden_connections'] as $kind => $field) {
            $explicit = array_key_exists($field, $data);
            $input = $explicit ? $data[$field] : $stored[$kind];
            if (!is_array($input) || !array_is_list($input) || count($input) > ($kind === 'hidden' ? 200 : 1000)) fail('error_validation');
            $state[$kind] = []; $seen = [];
            foreach ($input as $edge) {
                if (!is_array($edge) || !is_string($edge['from'] ?? null) || !is_string($edge['to'] ?? null)) fail('error_validation');
                $from = $edge['from']; $to = $edge['to'];
                $valid = $from !== $to && array_key_exists($from, $parents) && array_key_exists($to, $parents);
                if ($valid) {
                    $treeEdge = $parents[$to] === $from || $parents[$from] === $to;
                    $valid = $kind === 'hidden' ? $treeEdge : !$treeEdge;
                }
                // Preserve omitted fields, pruning lines invalidated by node edits.
                if (!$valid && !$explicit) continue;
                if (!$valid) fail('error_validation');
                $pair = [$from, $to]; sort($pair, SORT_STRING);
                $key = implode(':', $pair);
                if (isset($seen[$key])) fail('error_validation');
                $seen[$key] = true;
                $state[$kind][] = ['from' => $from, 'to' => $to];
            }
        }
        $edges = [];
        foreach ($parents as $to => $from) if ($from !== null) $edges[$from . ':' . $to] = true;
        foreach ($state['extra'] as $edge) $edges[$edge['from'] . ':' . $edge['to']] = true;
        foreach ($state['hidden'] as $edge) {
            unset($edges[$edge['from'] . ':' . $edge['to']], $edges[$edge['to'] . ':' . $edge['from']]);
        }
        $explicitStyles = array_key_exists('connection_styles', $data);
        $styles = $explicitStyles ? $data['connection_styles'] : $stored['styles'];
        if (!is_array($styles) || !array_is_list($styles) || count($styles) > 1200) fail('error_validation');
        $state['styles'] = []; $seen = [];
        foreach ($styles as $style) {
            if (!is_array($style) || !is_string($style['from'] ?? null) || !is_string($style['to'] ?? null)) fail('error_validation');
            $key = $style['from'] . ':' . $style['to'];
            if (!isset($edges[$key]) && !$explicitStyles) continue;
            if (!isset($edges[$key]) || isset($seen[$key])) fail('error_validation');
            $seen[$key] = true;
            $points = $style['points'] ?? null;
            if ($points !== null) {
                if (!is_array($points) || !array_is_list($points) || count($points) < 2 || count($points) > 64) fail('error_validation');
                foreach ($points as &$point) {
                    if (!is_array($point) || !array_is_list($point) || count($point) !== 2) fail('error_validation');
                    foreach ($point as &$value) {
                        if ((!is_int($value) && !is_float($value)) || !is_finite((float) $value) || abs($value) > 1000000) fail('error_validation');
                        $value = round((float) $value, 2);
                    }
                    unset($value);
                }
                unset($point);
                for ($i = 1; $i < count($points); $i++) {
                    if ($points[$i][0] !== $points[$i - 1][0] && $points[$i][1] !== $points[$i - 1][1]) fail('error_validation');
                }
            }
            $state['styles'][] = ['from' => $style['from'], 'to' => $style['to'], 'points' => $points,
                'label' => Validate::text($style, 'label', 120, false),
                'arrows' => Validate::choice($style['arrows'] ?? 'none', ['none', 'start', 'end', 'both'])];
        }
        $this->db->run('UPDATE diagrams SET connections_json=? WHERE id=?', [json_encode($state, JSON_THROW_ON_ERROR), $id]);
    }

    public function delete(array $data): array
    {
        $id = (int) ($data['id'] ?? 0);
        $diagram = $this->db->one('SELECT id,version FROM diagrams WHERE id=? AND owner_user_id=? FOR UPDATE', [$id, $this->uid()]);
        if (!$diagram) fail('error_not_found', 404);
        if ((int) ($data['version'] ?? 0) !== (int) $diagram['version']) fail('error_diagram_conflict', 409);
        $this->db->run('UPDATE diagram_nodes SET parent_key=NULL WHERE diagram_id=?', [$id]);
        $this->db->run('DELETE FROM diagrams WHERE id=? AND owner_user_id=?', [$id, $this->uid()]);
        return ['id' => $id];
    }

    private static function name(array $data, string $key, bool $required = true): string
    {
        // Keep deliberate newlines, including blank first and last lines.
        return preg_replace('/^[^\S\r\n]+|[^\S\r\n]+$/u', '', Validate::text($data, $key, 120, $required));
    }

    private static function rootNode(string $name): array
    {
        return ['id' => 'root', 'parent_id' => null, 'text' => $name, 'layout' => null, 'x' => null, 'y' => null, 'width' => null];
    }

    private static function validateNodes(mixed $input): array
    {
        if (!is_array($input) || !array_is_list($input) || count($input) < 1 || count($input) > 200) fail('error_validation');
        $nodes = [];
        foreach ($input as $item) {
            if (!is_array($item)) fail('error_validation');
            $id = $item['id'] ?? null;
            if (!is_string($id) || ($id !== 'root' && !preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/D', $id)) || isset($nodes[$id])) fail('error_validation');
            if (!array_key_exists('parent_id', $item)) fail('error_validation');
            $parent = $item['parent_id'];
            if (($id === 'root' && $parent !== null) || ($parent !== null && !is_string($parent))) fail('error_validation');
            if (!array_key_exists('text', $item) || !is_string($item['text'])) fail('error_validation');
            $text = self::name($item, 'text', false);
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
            if (array_key_exists('link', $item)) {
                $link = $item['link'];
                if ($link !== null) {
                    if (is_array($link) && array_key_exists('item_id', $link)) {
                        if (array_key_exists('diagram_id', $link) || !is_int($link['item_id']) || $link['item_id'] < 1 || !array_key_exists('target', $link)) fail('error_validation');
                        $target = $link['target'];
                        if ($target !== null) {
                            if (!is_array($target) || !is_string($target['id'] ?? null)) fail('error_validation');
                            $pattern = match ($target['type'] ?? '') {
                                'cell' => '/^[A-Z]{1,2}[1-9][0-9]{0,2}$/D',
                                'card' => '/^[a-f0-9-]{36}$/D',
                                'column' => '/^(backlog|todo|doing|done|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/D',
                                'habit' => '/^[1-9][0-9]{0,17}$/D',
                                default => null,
                            };
                            if (!$pattern || !preg_match($pattern, $target['id'])) fail('error_validation');
                            $target = ['type' => $target['type'], 'id' => $target['id']];
                        }
                        $link = ['item_id' => $link['item_id'], 'target' => $target];
                    } else {
                        if (!is_array($link) || array_key_exists('target', $link) || !is_int($link['diagram_id'] ?? null) || $link['diagram_id'] < 1
                            || !array_key_exists('node_id', $link)
                            || ($link['node_id'] !== null && (!is_string($link['node_id'])
                                || !preg_match('/^(root|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/D', $link['node_id'])))) fail('error_validation');
                        $link = ['diagram_id' => $link['diagram_id'], 'node_id' => $link['node_id']];
                    }
                }
                $node['link'] = $link;
            }
            foreach (['x','y'] as $axis) {
                $value = $item[$axis] ?? null;
                if ($value !== null && ((!is_int($value) && !is_float($value)) || !is_finite((float) $value) || abs($value) > 1000000)) fail('error_validation');
                $node[$axis] = $value === null ? null : round((float) $value, 2);
            }
            // Omission preserves a saved width for older clients; explicit null resets it.
            if (array_key_exists('width', $item)) {
                $width = $item['width'];
                if ($width !== null && ((!is_int($width) && !is_float($width)) || !is_finite((float) $width) || $width < 100 || $width > 600)) fail('error_validation');
                $node['width'] = $width === null ? null : round((float) $width, 2);
            }
            if (array_key_exists('image', $item)) $node['image'] = self::image($item['image']);
            if (array_key_exists('checkbox', $item)) {
                if ($item['checkbox'] !== null && !is_bool($item['checkbox'])) fail('error_validation');
                $node['checkbox'] = $item['checkbox'];
            }
            if (array_key_exists('labels', $item)) {
                if (!is_array($item['labels']) || !array_is_list($item['labels']) || count($item['labels']) > 10) fail('error_validation');
                $node['labels'] = [];
                foreach ($item['labels'] as $label) {
                    if (!is_array($label)) fail('error_validation');
                    $node['labels'][] = [
                        'text' => trim(Validate::text($label, 'text', 80)),
                        'position' => Validate::choice($label['position'] ?? null, ['outside', 'inside']),
                    ];
                }
            }
            $nodes[$id] = $node;
        }
        if (!isset($nodes['root'])) fail('error_validation');
        // Keep the canonical root for existing clients, while allowing additional
        // main ideas. Every ancestry chain must end at a node with no parent.
        foreach ($nodes as $node) {
            $seen = [];
            $cursor = $node;
            $depth = 0;
            while ($cursor['parent_id'] !== null) {
                if (isset($seen[$cursor['id']]) || ++$depth > 30 || !isset($nodes[$cursor['parent_id']])) fail('error_validation');
                $seen[$cursor['id']] = true;
                $cursor = $nodes[$cursor['parent_id']];
            }
        }
        return array_values($nodes);
    }

    private static function image(mixed $image): ?string
    {
        if ($image === null) return null;
        if (!is_string($image) || strlen($image) > 350000 || !preg_match('~^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$~D', $image, $parts)) fail('error_diagram_image');
        $bytes = base64_decode($parts[2], true);
        if ($bytes === false || strlen($bytes) > 262144) fail('error_diagram_image');
        $size = @getimagesizefromstring($bytes);
        if (!$size || $size['mime'] !== 'image/' . $parts[1] || $size[0] > 1024 || $size[1] > 1024) fail('error_diagram_image');
        return $image;
    }

    private function replaceNodes(int $id, array $nodes): void
    {
        $existingContent = [];
        foreach ($this->db->all('SELECT node_key,node_width,image_data,labels_json,checkbox_state,link_json FROM diagram_nodes WHERE diagram_id=?', [$id]) as $existing) {
            $existingContent[$existing['node_key']] = $existing;
        }
        $imageBytes = 0;
        $targets = [];
        foreach ($nodes as &$node) {
            $existing = $existingContent[$node['id']] ?? [];
            $previousLink = json_decode($existing['link_json'] ?? 'null', true, 8, JSON_THROW_ON_ERROR);
            if (!array_key_exists('link', $node)) $node['link'] = $previousLink;
            // A removed destination must not prevent unrelated edits to an
            // existing source. New/changed links must point to owned targets.
            if ($node['link'] !== null && $node['link'] !== $previousLink) {
                if (isset($node['link']['item_id'])) {
                    (new MindSpacesModel($this->db, $this->user))->validateLink($node['link']);
                } else {
                    $targetId = $node['link']['diagram_id'];
                    if ($targetId === $id) {
                        $targetKeys = array_column($nodes, 'id');
                    } else {
                        if (!array_key_exists($targetId, $targets)) {
                            $owned = $this->db->one('SELECT id FROM diagrams WHERE id=? AND owner_user_id=?', [$targetId, $this->uid()]);
                            $targets[$targetId] = $owned ? array_column($this->db->all('SELECT node_key FROM diagram_nodes WHERE diagram_id=?', [$targetId]), 'node_key') : null;
                        }
                        $targetKeys = $targets[$targetId];
                    }
                    if ($targetKeys === null || ($node['link']['node_id'] !== null && !in_array($node['link']['node_id'], $targetKeys, true))) fail('error_diagram_link_missing');
                }
            }
            if (!array_key_exists('width', $node)) $node['width'] = $existing['node_width'] ?? null;
            if (!array_key_exists('image', $node)) $node['image'] = $existing['image_data'] ?? null;
            if (!array_key_exists('checkbox', $node)) $node['checkbox'] = $existing['checkbox_state'] ?? null;
            if (!array_key_exists('labels', $node)) $node['labels'] = json_decode($existing['labels_json'] ?? '[]', true, 8, JSON_THROW_ON_ERROR);
            $imageBytes += strlen($node['image'] ?? '');
        }
        unset($node);
        if ($imageBytes > 2097152) fail('error_diagram_image_limit');
        // Detach old edges first: immediate SQL foreign keys also protect deep trees.
        $this->db->run('UPDATE diagram_nodes SET parent_key=NULL WHERE diagram_id=?', [$id]);
        $this->db->run('DELETE FROM diagram_nodes WHERE diagram_id=?', [$id]);
        foreach ($nodes as $position => $node) {
            $layout = $node['layout'];
            $this->db->run(
                'INSERT INTO diagram_nodes(diagram_id,node_key,parent_key,text,sort_order,layout_mode,layout_direction,layout_vertical,layout_horizontal,position_x,position_y,node_width,image_data,labels_json,checkbox_state,link_json) VALUES (?,?,NULL,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                [$id, $node['id'], $node['text'], $position, $layout['mode'] ?? null, $layout['direction'] ?? null, $layout['vertical'] ?? null, $layout['horizontal'] ?? null, $node['x'], $node['y'], $node['width'], $node['image'], json_encode($node['labels'], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), $node['checkbox'] === null ? null : (int) $node['checkbox'], $node['link'] === null ? null : json_encode($node['link'], JSON_THROW_ON_ERROR)],
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
            'width' => $node['node_width'] === null ? null : (float) $node['node_width'],
            'image' => $node['image_data'],
            'checkbox' => $node['checkbox_state'] === null ? null : (bool) $node['checkbox_state'],
            'labels' => json_decode($node['labels_json'] ?? '[]', true, 8, JSON_THROW_ON_ERROR),
            // Keep the legacy representation for topics without a link.
            ...($node['link_json'] === null ? [] : ['link' => json_decode($node['link_json'], true, 8, JSON_THROW_ON_ERROR)]),
        ];
    }
}
