<?php
declare(strict_types=1);

final class MindSpacesController
{
    public function __construct(private DB $db, private Auth $auth, private array $user) {}
    public function handle(string $action, array $data): array
    {
        $model = new MindSpacesModel($this->db, $this->user);
        return match ($action) {
            'mindspace' => $model->get(),
            'createMindSpace' => $model->createSpace($data),
            'renameMindSpace' => $model->renameSpace($data),
            'deleteMindSpace' => $model->deleteSpace($data),
            'deleteMindSpaceItem' => $model->delete($data),
            'createMindSpaceItem' => $model->create($data),
            'saveMindSpaceItem' => $model->save($data),
            'moveSpreadsheetRow' => $model->moveSheetRow($data),
            'getSpreadsheetInvoice' => $model->invoice($data),
            'saveSpreadsheetInvoice' => $model->saveInvoice($data),
            'addMindSpaceHabit' => $model->addHabit($data),
            'moveMindSpaceItem' => $model->move($data),
        };
    }
}
