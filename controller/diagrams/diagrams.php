<?php
declare(strict_types=1);

final class DiagramsController
{
    public function __construct(private DB $db, private Auth $auth, private array $user) {}

    public function handle(string $action, array $data): array
    {
        $diagrams = new DiagramsModel($this->db, $this->user);
        return match ($action) {
            'diagrams' => $diagrams->list(),
            'deleteDiagram' => $diagrams->delete($data),
            default => $diagrams->save($data),
        };
    }
}
