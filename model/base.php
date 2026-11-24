<?php
declare(strict_types=1);

abstract class BaseModel
{
    use AccessPolicy;
    protected ?array $workspaceHabit = null;

    // Internal capability: only the sharing gateway calls this after checking scope and permissions.
    public function authorizeWorkspaceHabit(int $id, string $permission, ?string $joined = null): void { $this->workspaceHabit = ['id' => $id, 'permission' => $permission, 'joined' => $joined]; }

    public function __construct(public DB $db, public array $user) {}

    public function uid(): int
    {
        return (int) $this->user['id'];
    }

    public function today(): string
    {
        return (new DateTimeImmutable('now', new DateTimeZone($this->user['timezone'])))->format(
            'Y-m-d',
        );
    }

    public function admin(): void
    {
        if (!in_array('admin', $this->user['roles'], true)) {
            fail('error_forbidden', 403);
        }
    }

    public function notify(int $uid, string $key, string $detail = ''): void
    {
        $enabled = $this->db->one(
            'SELECT notifications_enabled FROM user_settings WHERE user_id=?',
            [$uid],
        );
        if ($enabled && $enabled['notifications_enabled']) {
            $this->db->run('INSERT INTO notifications(user_id,message_key,detail) VALUES (?,?,?)', [
                $uid,
                $key,
                $detail,
            ]);
        }
    }

    public function activity(int $habit, string $action): void
    {
        $this->db->run(
            "INSERT INTO collaboration_activity(habit_id,user_id,action,description) VALUES (?,?,?,'')",
            [$habit, $this->uid(), $action],
        );
    }
}
