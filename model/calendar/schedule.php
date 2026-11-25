<?php
declare(strict_types=1);

final class Schedule
{
    public static function fields(array $d, string $today): array
    {
        $recurrence = Validate::choice($d['recurrence'] ?? 'weekly', ['once','daily','weekly','monthly','yearly']);
        $days = Validate::days($recurrence === 'weekly' ? ($d['schedule_days'] ?? [1,2,3,4,5,6,7]) : [1,2,3,4,5,6,7]);
        $start = Validate::date($d['start_date'] ?? $today);
        $end = !empty($d['end_date']) ? Validate::date($d['end_date']) : null;
        if ($end && $end < $start) fail('error_date');
        $time = ($d['scheduled_time'] ?? '') ?: null;
        if ($time !== null && (!is_string($time) || !preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d(?::00)?$/D', $time))) fail('error_validation');
        return [$recurrence, $days, $start, $recurrence === 'once' ? null : $end, $time];
    }

    public static function occurs(array $entry, string $date): bool
    {
        $start = $entry['start_date'];
        if ($date < max($start, $entry['tracking_start'] ?? $start) || (!empty($entry['end_date']) && $date > $entry['end_date'])) return false;
        $day = new DateTimeImmutable($date);
        $days = $entry['schedule_days'];
        if (!is_array($days)) $days = json_decode($days, true);
        // Short months use their last day; the original start date remains the anchor.
        $monthDay = min((int) substr($start, 8, 2), (int) $day->format('t'));
        return match ($entry['recurrence'] ?? 'weekly') {
            'once' => $date === $start,
            'daily' => true,
            'weekly' => in_array((int) $day->format('N'), $days, true),
            'monthly' => (int) $day->format('j') === $monthDay,
            'yearly' => substr($date, 5, 2) === substr($start, 5, 2) && (int) $day->format('j') === $monthDay,
            default => false,
        };
    }
}
