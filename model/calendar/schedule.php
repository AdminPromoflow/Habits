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
        return [$recurrence, $days, $start, $recurrence === 'once' ? null : $end, $time, self::validateRule($d['recurrence_rule'] ?? null, $recurrence, $start)];
    }

    public static function rule(array $entry): array
    {
        $rule = $entry['recurrence_rule'] ?? null;
        return is_array($rule) ? $rule : (json_decode($rule ?? 'null', true) ?: []);
    }

    private static function integers(mixed $values, array $allowed): array
    {
        if (!is_array($values) || !$values || count($values) > count($allowed)) fail('error_planner_selection');
        foreach ($values as $v) if (!is_int($v) || !in_array($v, $allowed, true)) fail('error_validation');
        $values = array_values(array_unique($values)); sort($values);
        return $values;
    }

    public static function validateRule(mixed $rule, string $recurrence, string $start): ?string
    {
        if ($rule === null || $rule === []) return null;
        if (!is_array($rule)) fail('error_validation');
        if (!in_array($recurrence, ['monthly','yearly'], true)) return null;
        $normalized = ['month_mode'=>Validate::choice($rule['month_mode'] ?? 'dates', ['dates','weekdays'])];
        if ($normalized['month_mode'] === 'dates') {
            $normalized['month_days'] = self::integers($rule['month_days'] ?? [(int) substr($start,8,2)], range(1,31));
        } else {
            $normalized['positions'] = self::integers($rule['positions'] ?? [], [-1,1,2,3,4,5]);
            $normalized['weekdays'] = self::integers($rule['weekdays'] ?? [], range(1,7));
        }
        if ($recurrence === 'yearly') $normalized['months'] = self::integers($rule['months'] ?? [(int) substr($start,5,2)], range(1,12));
        else {
            $interval = $rule['interval'] ?? 1;
            if (!is_int($interval) || $interval < 1 || $interval > 12) fail('error_validation');
            $normalized['interval'] = $interval;
        }
        return json_encode($normalized, JSON_THROW_ON_ERROR);
    }

    public static function occurs(array $entry, string $date): bool
    {
        $start = $entry['start_date'];
        if ($date < max($start, $entry['tracking_start'] ?? $start) || (!empty($entry['end_date']) && $date > $entry['end_date'])) return false;
        $day = new DateTimeImmutable($date);
        $days = $entry['schedule_days'];
        if (!is_array($days)) $days = json_decode($days, true);
        $recurrence = $entry['recurrence'] ?? 'weekly';
        if ($recurrence === 'once') return $date === $start;
        if ($recurrence === 'daily') return true;
        if ($recurrence === 'weekly') return in_array((int) $day->format('N'), $days, true);
        if (!in_array($recurrence, ['monthly','yearly'], true)) return false;
        $rule = self::rule($entry);
        if ($recurrence === 'yearly' && !in_array((int) $day->format('n'), $rule['months'] ?? [(int) substr($start,5,2)], true)) return false;
        $monthOffset = ((int) substr($date,0,4) - (int) substr($start,0,4))*12 + (int) substr($date,5,2) - (int) substr($start,5,2);
        if ($recurrence === 'monthly' && $monthOffset % ($rule['interval'] ?? 1) !== 0) return false;
        $number = (int) $day->format('j'); $last = (int) $day->format('t');
        if (($rule['month_mode'] ?? 'dates') === 'weekdays') {
            $position = (int) floor(($number-1)/7)+1;
            return in_array((int) $day->format('N'), $rule['weekdays'], true)
                && (in_array($position, $rule['positions'], true) || ($number+7 > $last && in_array(-1, $rule['positions'], true)));
        }
        // Preserve the anchor day, clamping to the last day in short months.
        foreach ($rule['month_days'] ?? [(int) substr($start,8,2)] as $anchor) if ($number === min($anchor,$last)) return true;
        return false;
    }
}
