<?php
declare(strict_types=1);

final class DiagramsModel extends BaseModel
{
    public function list(): array
    {
        return $this->db->all(
            'SELECT id,name,version,created_at,updated_at FROM diagrams WHERE owner_user_id=? ORDER BY updated_at DESC,id DESC',
            [$this->uid()],
        );
    }

    public function save(array $data): array
    {
        // Trim edge spacing without removing intentional first/last newlines.
        $name = preg_replace(
            '/^[^\S\r\n]+|[^\S\r\n]+$/u',
            '',
            Validate::text($data, 'name', 120),
        );
        $id = (int) ($data['id'] ?? 0);
        if ($id) {
            $diagram = $this->db->one(
                'SELECT id,version FROM diagrams WHERE id=? AND owner_user_id=? FOR UPDATE',
                [$id, $this->uid()],
            );
            if (!$diagram) {
                fail('error_not_found', 404);
            }
            if ((int) ($data['version'] ?? 0) !== (int) $diagram['version']) {
                fail('error_diagram_conflict', 409);
            }
            $this->db->run(
                'UPDATE diagrams SET name=?,version=version+1,updated_at=UTC_TIMESTAMP() WHERE id=? AND owner_user_id=?',
                [$name, $id, $this->uid()],
            );
        } else {
            // A client-generated key makes retrying a lost create response safe.
            $key = Validate::text($data, 'client_key', 64);
            if (!preg_match('/^[a-f0-9-]{36}$/D', $key)) {
                fail('error_validation');
            }
            $existing = $this->db->one(
                'SELECT id FROM diagrams WHERE owner_user_id=? AND client_key=? FOR UPDATE',
                [$this->uid(), $key],
            );
            if ($existing) {
                $id = (int) $existing['id'];
            } else {
                $this->db->run(
                    'INSERT INTO diagrams(owner_user_id,name,client_key) VALUES (?,?,?)',
                    [$this->uid(), $name, $key],
                );
                $id = $this->db->id();
            }
        }
        return $this->db->one(
            'SELECT id,name,version,created_at,updated_at FROM diagrams WHERE id=? AND owner_user_id=?',
            [$id, $this->uid()],
        );
    }
}
