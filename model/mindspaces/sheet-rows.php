<?php
declare(strict_types=1);

/** Reorder a complete spreadsheet row, retaining references to moved cells. */
final class SpreadsheetRows
{
    public static function row(int $row, int $from, int $to): int
    {
        if ($row === $from) return $to;
        if ($from < $to && $row > $from && $row <= $to) return $row - 1;
        if ($from > $to && $row >= $to && $row < $from) return $row + 1;
        return $row;
    }

    public static function key(string $key, int $from, int $to): string
    {
        return preg_replace_callback('/^(\$?[A-Z]+\$?)([1-9][0-9]*)$/iD', fn($m) => $m[1].self::row((int) $m[2],$from,$to), $key);
    }

    private static function formula(string $value, int $from, int $to, int $rows): string
    {
        if (!str_starts_with($value,'=')) return $value;
        return preg_replace_callback('/"(?:[^"]|"")*"|(?<![A-Z0-9_])\$?[A-Z]+\$?[1-9][0-9]*(?:\s*:\s*\$?[A-Z]+\$?[1-9][0-9]*)?(?![A-Z0-9_])/i', static function ($match) use ($from,$to,$rows) {
            $reference = $match[0];
            if ($reference[0] === '"') return $reference;
            if (!str_contains($reference,':')) return self::key($reference,$from,$to);
            preg_match('/^(\$?[A-Z]+\$?)([1-9][0-9]*)\s*:\s*(\$?[A-Z]+\$?)([1-9][0-9]*)$/iD',$reference,$parts);
            $first = min((int) $parts[2],(int) $parts[4]); $last = max((int) $parts[2],(int) $parts[4]);
            if ($last > $rows || $last < min($from,$to) || $first > max($from,$to)) return $reference;
            $mapped = array_map(fn($row) => self::row($row,$from,$to),range($first,$last));
            sort($mapped);
            if ($mapped === range($first,$last)) return $reference;
            // A moved row may split a SUM/AVERAGE/etc. range. Keep exactly the
            // original cells as consecutive ranges, rather than include new data.
            $ranges = []; $start = $previous = $mapped[0];
            foreach (array_slice($mapped,1) as $row) {
                if ($row !== $previous+1) { $ranges[] = $parts[1].$start.':'.$parts[3].$previous; $start = $row; }
                $previous = $row;
            }
            $ranges[] = $parts[1].$start.':'.$parts[3].$previous;
            return implode(',',$ranges);
        },$value);
    }

    public static function move(array $sheet, int $from, int $to): array
    {
        $minimum = empty($sheet['template']) ? 1 : 2;
        if ($from < $minimum || $to < $minimum || $from > $sheet['rows'] || $to > $sheet['rows']) fail('error_validation');
        if ($from === $to) return $sheet;
        foreach (['cells','cell_styles','invoices'] as $field) {
            if (!array_key_exists($field,$sheet)) continue;
            $mapped = [];
            foreach ($sheet[$field] as $key=>$value) {
                $mapped[self::key($key,$from,$to)] = $field === 'cells' ? self::formula($value,$from,$to,$sheet['rows']) : $value;
            }
            $sheet[$field] = $mapped;
        }
        return $sheet;
    }
}
