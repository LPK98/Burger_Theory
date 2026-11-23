<?php

namespace App\Support;

use InvalidArgumentException;

/**
 * Ingredient quantities are NUMERIC(12,3). Arithmetic happens in integer thousandths so a
 * stored movement always satisfies quantity_after = quantity_before + change exactly.
 */
final class Quantity
{
    /** "12.5" | 12.5 | 12 => 12500 */
    public static function toMilli(string|int|float $value): int
    {
        if (is_int($value)) {
            return $value * 1000;
        }
        if (is_float($value)) {
            return (int) round($value * 1000);
        }

        $value = trim($value);
        if (! preg_match('/^(-?)(\d+)(?:\.(\d{1,3})\d*)?$/', $value, $m)) {
            throw new InvalidArgumentException("Invalid quantity [{$value}].");
        }
        $milli = ((int) $m[2]) * 1000 + (int) str_pad($m[3] ?? '0', 3, '0');

        return $m[1] === '-' ? -$milli : $milli;
    }

    /** 12500 => "12.500" (the database's own format). */
    public static function fromMilli(int $milli): string
    {
        $sign = $milli < 0 ? '-' : '';
        $abs = abs($milli);

        return $sign.intdiv($abs, 1000).'.'.str_pad((string) ($abs % 1000), 3, '0', STR_PAD_LEFT);
    }

    /** For JSON: 12.5 rather than "12.500". */
    public static function toFloat(string|int|float|null $value): ?float
    {
        return $value === null ? null : self::toMilli($value) / 1000;
    }
}
