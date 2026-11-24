<?php
declare(strict_types=1);
final class Validate
{
    public static function text(
        array $data,
        string $key,
        int $max = 190,
        bool $required = true,
    ): string {
        if (isset($data[$key]) && !is_string($data[$key])) {
            fail('error_validation');
        }
        $v = $data[$key] ?? '';
        if (($required && trim($v) === '') || mb_strlen($v) > $max || str_contains($v, "\0")) {
            fail('error_validation');
        }
        return $v; // Personal content is never translated or normalized.
    }
    public static function choice(mixed $v, array $options): string
    {
        if (!is_string($v) || !in_array($v, $options, true)) {
            fail('error_validation');
        }
        return $v;
    }
    public static function date(mixed $v): string
    {
        if (!is_string($v)) {
            fail('error_date');
        }
        $d = DateTimeImmutable::createFromFormat('!Y-m-d', $v);
        if (!$d || $d->format('Y-m-d') !== $v) {
            fail('error_date');
        }
        return $v;
    }
    public static function number(mixed $v, float $min = 0, float $max = 999999): float
    {
        if (!is_numeric($v) || !is_finite((float) $v) || (float) $v < $min || (float) $v > $max) {
            fail('error_validation');
        }
        return round((float) $v, 2);
    }
    public static function days(mixed $v): string
    {
        if (!is_array($v) || count($v) < 1 || count($v) > 7) {
            fail('error_schedule');
        }
        $days = [];
        foreach ($v as $d) {
            if (!is_numeric($d) || (int) $d != $d || $d < 1 || $d > 7) {
                fail('error_schedule');
            }
            $days[] = (int) $d;
        }
        return json_encode(array_values(array_unique($days)), JSON_THROW_ON_ERROR);
    }
    public static function email(mixed $v): string
    {
        if (!is_string($v) || strlen($v) > 190 || !filter_var($v, FILTER_VALIDATE_EMAIL)) {
            fail('error_email');
        }
        return strtolower(trim($v));
    }
    public static function color(mixed $v): string
    {
        if (!is_string($v) || !preg_match('/^#[a-fA-F0-9]{6}$/D', $v)) {
            fail('error_validation');
        }
        return $v;
    }
    public static function password(mixed $v): string
    {
        if (!is_string($v) || strlen($v) < 12 || strlen($v) > 72) {
            fail('error_password');
        }
        return $v;
    }
}
