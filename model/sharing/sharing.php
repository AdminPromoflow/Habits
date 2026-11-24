<?php
declare(strict_types=1);

final class SharingModel extends BaseModel
{
    public function share(array $d): void
    {
        $email = Validate::email($d['email'] ?? null);
        $permission = Validate::choice($d['permission'] ?? 'viewer', [
            'viewer',
            'participant',
            'editor',
        ]);
        $visibility = Validate::choice($d['progress_visibility'] ?? 'none', [
            'none',
            'summary',
            'detailed',
        ]);
        $message = Validate::text($d, 'invitation_message', 1000, false);
        $category = !empty($d['category_id']) ? (int) $d['category_id'] : null;
        $ids = $d['habit_ids'] ?? [];
        if (!is_array($ids) || count($ids) > 50 || ($category !== null) === count($ids) > 0) {
            fail('error_validation');
        }
        $resources = [];
        if ($category) {
            $this->category($category);
            $resources[] = ['habit' => null, 'category' => $category];
        } else {
            foreach (array_unique($ids) as $id) {
                $this->habit((int) $id, 'owner', true);
                $resources[] = ['habit' => (int) $id, 'category' => null];
            };
        }
        $recipient = $this->db->one("SELECT id FROM users WHERE email=? AND status='active'", [
            $email,
        ]);
        // Opaque receipts exist for all addresses, including unknown ones. Pending lists never disclose account existence.
        foreach ($resources as $r) {
            $existing = $this->db->one(
                "SELECT id FROM invitation_receipts WHERE owner_user_id=? AND recipient_email=? AND status IN ('pending','accepted') AND habit_id <=> ? AND category_id <=> ? FOR UPDATE",
                [$this->uid(), $email, $r['habit'], $r['category']],
            );
            if ($existing) {
                continue;
            }
            $future = $category && !empty($d['include_future']) ? 1 : 0;
            $shareId = null;
            if ($recipient && (int) $recipient['id'] !== $this->uid()) {
                $this->db->run(
                    'INSERT INTO habit_shares(owner_user_id,recipient_user_id,habit_id,category_id,permission,progress_visibility,include_future,invitation_message) VALUES (?,?,?,?,?,?,?,?)',
                    [
                        $this->uid(),
                        $recipient['id'],
                        $r['habit'],
                        $r['category'],
                        $permission,
                        $visibility,
                        $future,
                        $message,
                    ],
                );
                $shareId = $this->db->id();
                if ($category) {
                    $this->db->run(
                        'INSERT INTO share_habits(share_id,habit_id) SELECT ?,id FROM habits WHERE owner_user_id=? AND category_id=?',
                        [$shareId, $this->uid(), $category],
                    );
                }
                $this->notify((int) $recipient['id'], 'notification_invitation');
            }
            $this->db->run(
                'INSERT INTO invitation_receipts(owner_user_id,share_id,recipient_email,habit_id,category_id,permission,progress_visibility,include_future,invitation_message) VALUES (?,?,?,?,?,?,?,?,?)',
                [
                    $this->uid(),
                    $shareId,
                    $email,
                    $r['habit'],
                    $r['category'],
                    $permission,
                    $visibility,
                    $future,
                    $message,
                ],
            );
            $this->notify($this->uid(), 'notification_invitation_sent', $email);
        }
    }

    public function respond(array $d): void
    {
        $s = $this->db->one(
            'SELECT * FROM habit_shares WHERE id=? AND recipient_user_id=? FOR UPDATE',
            [(int) ($d['id'] ?? 0), $this->uid()],
        );
        if (!$s || $s['status'] !== 'pending') {
            fail('error_not_found', 404);
        }
        $status = Validate::choice($d['status'] ?? '', ['accepted', 'declined']);
        $this->db->run('UPDATE habit_shares SET status=?,responded_at=UTC_TIMESTAMP() WHERE id=?', [
            $status,
            $s['id'],
        ]);
        $this->db->run('UPDATE invitation_receipts SET status=? WHERE share_id=?', [
            $status,
            $s['id'],
        ]);
        $this->syncCollaborators();
        $this->notify(
            (int) $s['owner_user_id'],
            'notification_invitation_' . $status,
            $this->user['name'],
        );
    }

    public function changeShare(array $d): void
    {
        $r = $this->db->one(
            'SELECT * FROM invitation_receipts WHERE id=? AND owner_user_id=? FOR UPDATE',
            [(int) ($d['id'] ?? 0), $this->uid()],
        );
        if (!$r || !in_array($r['status'], ['pending', 'accepted'], true)) {
            fail('error_not_found', 404);
        }
        if (($d['status'] ?? null) === 'revoked') {
            if ($r['share_id']) {
                $this->db->run(
                    "UPDATE habit_shares SET status='revoked',responded_at=UTC_TIMESTAMP() WHERE id=?",
                    [$r['share_id']],
                );
            }
            $this->db->run("UPDATE invitation_receipts SET status='revoked' WHERE id=?", [
                $r['id'],
            ]);
        } else {
            $permission = Validate::choice($d['permission'] ?? $r['permission'], [
                'viewer',
                'participant',
                'editor',
            ]);
            $visibility = Validate::choice($d['progress_visibility'] ?? $r['progress_visibility'], [
                'none',
                'summary',
                'detailed',
            ]);
            $future = $r['category_id'] && !empty($d['include_future']) ? 1 : 0;
            if ($r['share_id']) {
                $this->db->run(
                    'UPDATE habit_shares SET permission=?,progress_visibility=?,include_future=? WHERE id=?',
                    [$permission, $visibility, $future, $r['share_id']],
                );
            }
            $this->db->run(
                'UPDATE invitation_receipts SET permission=?,progress_visibility=?,include_future=? WHERE id=?',
                [$permission, $visibility, $future, $r['id']],
            );
        }
        $this->syncCollaborators();
    }

    public function leaveShare(array $d): void
    {
        $s = $this->db->one(
            "SELECT * FROM habit_shares WHERE id=? AND recipient_user_id=? AND status='accepted' FOR UPDATE",
            [(int) ($d['id'] ?? 0), $this->uid()],
        );
        if (!$s) {
            fail('error_not_found', 404);
        }
        $this->db->run(
            "UPDATE habit_shares SET status='revoked',responded_at=UTC_TIMESTAMP() WHERE id=?",
            [$s['id']],
        );
        $this->db->run("UPDATE invitation_receipts SET status='revoked' WHERE share_id=?", [
            $s['id'],
        ]);
        $this->syncCollaborators();
    }

    public function syncCollaborators(): void
    {
        // Derived membership is only a cache; authorization always rechecks the original grant.
        $shares = $this->db->all(
            "SELECT s.* FROM habit_shares s JOIN users u ON u.id=s.owner_user_id JOIN users r ON r.id=s.recipient_user_id WHERE s.status='accepted' AND s.permission IN ('participant','editor') AND u.status='active' AND r.status='active' AND (s.owner_user_id=? OR s.recipient_user_id=?)",
            [$this->uid(), $this->uid()],
        );
        foreach ($shares as $s) {
            $habits = $this->db->all(
                'SELECT h.id FROM habits h WHERE h.owner_user_id=? AND (h.id=? OR (h.category_id=? AND (?=1 OR EXISTS(SELECT 1 FROM share_habits sh WHERE sh.share_id=? AND sh.habit_id=h.id))))',
                [
                    $s['owner_user_id'],
                    $s['habit_id'],
                    $s['category_id'],
                    $s['include_future'],
                    $s['id'],
                ],
            );
            foreach ($habits as $h) {
                $this->db->run(
                    'INSERT INTO habit_collaborators(habit_id,user_id,share_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE share_id=VALUES(share_id)',
                    [$h['id'], $s['recipient_user_id'], $s['id']],
                );
            }
        }
        // Keep historical membership/consent and independent logs after revocation, but do not expose or authorize via them.
    }

    public function consent(array $d): void
    {
        $h = $this->habit((int) ($d['habit_id'] ?? 0), 'participant', true);
        if ($h['permission'] === 'owner') {
            fail('error_validation');
        }
        $consent = Validate::choice($d['progress_consent'] ?? 'none', [
            'none',
            'summary',
            'detailed',
        ]);
        $this->db->run(
            'UPDATE habit_collaborators SET progress_consent=? WHERE habit_id=? AND user_id=?',
            [$consent, $h['id'], $this->uid()],
        );
    }

    public function group(array $d): array
    {
        $h = $this->habit((int) ($d['habit_id'] ?? 0));
        $end = Validate::date($d['end'] ?? $this->today());
        $start = Validate::date(
            $d['start'] ?? (new DateTimeImmutable($end))->modify('-29 days')->format('Y-m-d'),
        );
        if (
            $end > $this->today() ||
            $start > $end ||
            (new DateTimeImmutable($start))->diff(new DateTimeImmutable($end))->days > 365
        ) {
            fail('error_date');
        }
        $members = [
            [
                'user_id' => (int) $h['owner_user_id'],
                'name' => $h['owner_name'],
                'progress_consent' => 'detailed',
                'joined_on' => $h['start_date'],
            ],
        ];
        foreach (
            $this->db->all(
                "SELECT c.*,u.name,us.timezone FROM habit_collaborators c JOIN users u ON u.id=c.user_id AND u.status='active' JOIN user_settings us ON us.user_id=u.id WHERE c.habit_id=?",
                [$h['id']],
            )
            as $member
        ) {
            $member['joined_on'] = (new DateTimeImmutable(
                $member['joined_at'],
                new DateTimeZone('UTC'),
            ))
                ->setTimezone(new DateTimeZone($member['timezone']))
                ->format('Y-m-d');
            try {
                $a = $this->access($h, (int) $member['user_id']);
                if (self::RANK[$a['permission']] >= 2) {
                    $members[] = $member;
                }
            } catch (AppError $e) {
                /* Revoked membership contributes nothing. */
            }
        }
        $out = [];
        $rates = [];
        foreach ($members as $member) {
            $uid = (int) $member['user_id'];
            $vis = $uid === $this->uid() ? 'detailed' : $member['progress_consent'];
            if (
                $uid !== $this->uid() &&
                $h['permission'] !== 'owner' &&
                self::VIS[$h['progress_visibility']] < self::VIS[$vis]
            ) {
                $vis = $h['progress_visibility'];
            }
            $item = ['user_id' => $uid, 'name' => $member['name'], 'visibility' => $vis];
            if ($vis !== 'none') {
                $from = max($start, $h['start_date'], $member['joined_on']);
                $expected = 0;
                for (
                    $date = new DateTimeImmutable($from);
                    $date->format('Y-m-d') <= $end;
                    $date = $date->modify('+1 day')
                ) {
                    if (Habits::scheduled($h, $date->format('Y-m-d'))) {
                        $expected++;
                    }
                }
                $rows = $this->db->all(
                    'SELECT completed_on,amount,goal_at_time FROM habit_completions WHERE habit_id=? AND user_id=? AND completed_on BETWEEN ? AND ?',
                    [$h['id'], $uid, $from, $end],
                );
                $done = 0;
                $fraction = 0;
                foreach ($rows as $row) {
                    if (Habits::scheduled($h, $row['completed_on'])) {
                        $fraction += min(1, (float) $row['amount'] / (float) $row['goal_at_time']);
                        if ($row['amount'] >= $row['goal_at_time']) {
                            $done++;
                        }
                    }
                }
                $item += [
                    'completed' => $done,
                    'expected' => $expected,
                    'percent' => $expected ? round(($fraction / $expected) * 100, 1) : 0,
                ];
                if ($vis === 'detailed') {
                    $item['history'] = $rows;
                }
                if ($expected) {
                    $rates[] = $item['percent'];
                }
            }
            $out[] = $item;
        }
        return [
            'members' => $out,
            'average' => $rates ? round(array_sum($rates) / count($rates), 1) : null,
            'visible_count' => count($rates),
            'start' => $start,
            'end' => $end,
        ];
    }
}
