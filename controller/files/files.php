<?php
declare(strict_types=1);

final class FilesController
{
    public function __construct(private DB $db, private Auth $auth, private array $user) {}
    public function handle(string $action, array $data): array|LibraryDownload
    {
        $model = new FileLibraryModel($this->db, $this->user);
        return match ($action) {
            'libraryEntries' => $model->listing($data),
            'libraryFile' => $model->download($data),
            'createLibraryFolder' => $model->folder($data),
            'uploadLibraryFile' => $model->upload($data, $_FILES['file'] ?? []),
            'renameLibraryEntry' => $model->rename($data),
            'deleteLibraryEntry' => $model->delete($data),
        };
    }
}
