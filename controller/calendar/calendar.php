<?php
declare(strict_types=1);

final class CalendarController
{
    public function __construct(private DB $db, private Auth $auth, private array $user) {}
    public function handle(string $action, array $data): mixed
    {
        $model = new CalendarModel($this->db, $this->user);
        return match ($action) {
            'saveCalendarEntry' => $model->save($data),
            'completeCalendarTask' => $model->complete($data),
            'deleteCalendarTask' => $model->delete($data),
            default => fail('error_not_found', 404),
        };
    }
}
