<?php
declare(strict_types=1);

final class FileLibraryModel extends BaseModel
{
    public const MAX_FILE = 20971520;
    private const MAX_LIBRARY = 524288000;
    private const FIELDS = 'id,parent_id,kind,name,mime,size_bytes,created_at';

    public static function uploadLimit(): int
    {
        $bytes = static function (string $value): int {
            $number = (int) $value;
            return $number > 0 ? $number * match (strtolower(substr(trim($value), -1))) { 'g' => 1073741824, 'm' => 1048576, 'k' => 1024, default => 1 } : PHP_INT_MAX;
        };
        return max(0, min(self::MAX_FILE, $bytes(ini_get('upload_max_filesize')), $bytes(ini_get('post_max_size')) - 65536));
    }

    private function libraryAccess(array $data, ?string $right = null): int
    {
        $id = (int) ($data['id'] ?? 0);
        if (!empty($data['share_id'])) {
            (new MindSpaceShares($this->db, $this->user))->authorizeFileLibrary((int) $data['share_id'], $id, $right);
        } else {
            $item = $this->db->one("SELECT i.mindspace_id FROM mindspace_items i JOIN mindspaces m ON m.id=i.mindspace_id WHERE i.id=? AND i.kind='files' AND m.owner_user_id=?", [$id, $this->uid()]);
            if (!$item) fail('error_not_found', 404);
            if ($right !== null) {
                $this->db->one('SELECT id FROM mindspaces WHERE id=? FOR UPDATE', [$item['mindspace_id']]);
                if (!$this->db->one("SELECT i.id FROM mindspace_items i JOIN mindspaces m ON m.id=i.mindspace_id WHERE i.id=? AND i.kind='files' AND m.owner_user_id=? FOR UPDATE", [$id, $this->uid()])) fail('error_not_found', 404);
            }
        }
        return $id;
    }

    private function entry(int $item, int $id): array
    {
        $entry = $this->db->one('SELECT ' . self::FIELDS . ' FROM library_entries WHERE item_id=? AND id=?', [$item, $id]);
        if (!$entry) fail('error_not_found', 404);
        return $entry;
    }

    private function parent(int $item, mixed $value): ?int
    {
        $id = (int) $value;
        if (!$id) return null;
        $entry = $this->entry($item, $id);
        if ($entry['kind'] !== 'folder') fail('error_validation');
        // Stay below InnoDB's cascading foreign-key depth limit.
        for ($depth = 1; $entry['parent_id']; $depth++) {
            if ($depth >= 10) fail('files_depth');
            $entry = $this->entry($item, (int) $entry['parent_id']);
        }
        return $id;
    }

    private function name(array $data): string
    {
        $name = Validate::text($data, 'name', 180);
        if (preg_match('/[\x00-\x1f\x7f\/\\\\]/u', $name)) fail('error_validation');
        return $name;
    }

    private function key(array $data): string
    {
        $key = Validate::text($data, 'client_key', 36);
        if (!preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/D', $key)) fail('error_validation');
        return $key;
    }

    private function capacity(int $item, int $bytes): void
    {
        $total = $this->db->one('SELECT COUNT(*) AS entries,COALESCE(SUM(size_bytes),0) AS bytes FROM library_entries WHERE item_id=?', [$item]);
        if ($total['entries'] >= 1000 || $total['bytes'] + $bytes > self::MAX_LIBRARY) fail('files_capacity');
    }

    public function listing(array $data): array
    {
        $item = $this->libraryAccess($data);
        return ['entries' => $this->db->all('SELECT ' . self::FIELDS . ' FROM library_entries WHERE item_id=? ORDER BY created_at DESC,id DESC', [$item]), 'upload_limit' => self::uploadLimit()];
    }

    public function folder(array $data): array
    {
        $item = $this->libraryAccess($data, 'edit');
        $name = $this->name($data); $key = $this->key($data);
        $parent = $this->parent($item, $data['parent_id'] ?? null);
        $prior = $this->db->one('SELECT id,kind FROM library_entries WHERE item_id=? AND client_key=?', [$item, $key]);
        if ($prior) { if ($prior['kind'] !== 'folder') fail('error_validation'); return $this->entry($item, (int) $prior['id']); }
        $this->capacity($item, 0);
        $this->db->run("INSERT INTO library_entries(item_id,parent_id,kind,name,client_key) VALUES (?,?,'folder',?,?)", [$item, $parent, $name, $key]);
        return $this->entry($item, $this->db->id());
    }

    public function upload(array $data, array $file): array
    {
        $item = $this->libraryAccess($data, 'edit');
        $name = $this->name($data); $key = $this->key($data);
        $parent = $this->parent($item, $data['parent_id'] ?? null);
        $prior = $this->db->one('SELECT id,kind FROM library_entries WHERE item_id=? AND client_key=?', [$item, $key]);
        if ($prior) { if ($prior['kind'] === 'folder') fail('error_validation'); return $this->entry($item, (int) $prior['id']); }
        $error = $file['error'] ?? UPLOAD_ERR_NO_FILE;
        if (in_array($error, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) fail('files_too_large', 413);
        if ($error !== UPLOAD_ERR_OK || !is_string($file['tmp_name'] ?? null) || !is_uploaded_file($file['tmp_name'])) fail('files_upload_error');
        $size = filesize($file['tmp_name']);
        if (!$size || $size > self::uploadLimit()) fail('files_too_large', 413);
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
        $isPdf = $mime === 'application/pdf';
        if (!$isPdf && !in_array($mime, ['image/jpeg','image/png','image/webp','image/gif'], true)) fail('files_type');
        if ($isPdf) {
            $handle = fopen($file['tmp_name'], 'rb');
            $head = fread($handle, 5); fseek($handle, max(0, $size - 4096)); $tail = stream_get_contents($handle); fclose($handle);
            if ($head !== '%PDF-' || !str_contains($tail, '%%EOF')) fail('files_invalid_pdf');
        } else {
            $image = @getimagesize($file['tmp_name']);
            if (!$image || ($image['mime'] ?? '') !== $mime || $image[0] * $image[1] > 50000000) fail('files_type');
        }
        $this->capacity($item, $size);
        $this->db->run('INSERT INTO library_entries(item_id,parent_id,kind,name,mime,size_bytes,client_key) VALUES (?,?,?,?,?,?,?)', [$item, $parent, $isPdf ? 'pdf' : 'image', $name, $mime, $size, $key]);
        $id = $this->db->id();
        // Small rows work with hosting providers' packet limits. The request's
        // transaction makes the entry and all of its bytes visible atomically.
        $handle = fopen($file['tmp_name'], 'rb');
        try {
            for ($index = 0; !feof($handle); $index++) {
                $bytes = fread($handle, 524288);
                if ($bytes === false) throw new RuntimeException('Unable to read upload');
                if ($bytes !== '') $this->db->run('INSERT INTO library_file_chunks(entry_id,chunk_index,bytes) VALUES (?,?,?)', [$id, $index, $bytes]);
            }
        } finally { fclose($handle); }
        return $this->entry($item, $id);
    }

    public function rename(array $data): array
    {
        $item = $this->libraryAccess($data, 'edit');
        $entry = $this->entry($item, (int) ($data['entry_id'] ?? 0));
        $this->db->run('UPDATE library_entries SET name=? WHERE id=?', [$this->name($data), $entry['id']]);
        return $this->entry($item, (int) $entry['id']);
    }

    public function delete(array $data): array
    {
        $item = $this->libraryAccess($data, 'delete');
        $entry = $this->entry($item, (int) ($data['entry_id'] ?? 0));
        $this->db->run('DELETE FROM library_entries WHERE id=?', [$entry['id']]);
        return ['id' => $entry['id']];
    }

    public function download(array $data): LibraryDownload
    {
        $item = $this->libraryAccess($data);
        $entry = $this->entry($item, (int) ($data['entry_id'] ?? 0));
        if ($entry['kind'] === 'folder') fail('error_not_found', 404);
        return new LibraryDownload($this->db, $entry, !empty($data['download']));
    }
}

final class LibraryDownload
{
    public function __construct(private DB $db, private array $entry, private bool $attachment) {}
    public function send(): void
    {
        session_write_close();
        header('Content-Type: ' . $this->entry['mime']);
        header('Content-Length: ' . $this->entry['size_bytes']);
        header("Content-Disposition: " . ($this->attachment || $this->entry['kind'] === 'pdf' ? 'attachment' : 'inline') . "; filename=\"file\"; filename*=UTF-8''" . rawurlencode($this->entry['name']));
        $rows = $this->db->run('SELECT bytes FROM library_file_chunks WHERE entry_id=? ORDER BY chunk_index', [$this->entry['id']]);
        while ($row = $rows->fetch()) echo $row['bytes'];
    }
}
