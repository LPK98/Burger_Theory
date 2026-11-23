<?php

namespace App\Support;

use InvalidArgumentException;

/**
 * Money helpers. The database stores NUMERIC(10,2) amounts (dollars, the restaurant currency); everything in PHP and in
 * the API is an integer number of minor units (cents), so arithmetic is exact and
 * never touches floating point.
 */
final class Money
{
    /** "1450.00" → 145000. Accepts the strings PostgreSQL returns for NUMERIC columns. */
    public static function toMinor(string|int $decimal): int
    {
        if (is_int($decimal)) {
            return $decimal * 100;
        }

        $value = trim($decimal);
        if (! preg_match('/^(-)?(\d+)(?:\.(\d+))?$/', $value, $m)) {
            throw new InvalidArgumentException("Not a decimal amount: [{$decimal}]");
        }

        $fraction = $m[3] ?? '';
        if (strlen($fraction) > 2 && trim(substr($fraction, 2), '0') !== '') {
            throw new InvalidArgumentException("Amount has more than two decimal places: [{$decimal}]");
        }

        $minor = ((int) $m[2]) * 100 + (int) str_pad(substr($fraction, 0, 2), 2, '0');

        return $m[1] === '-' ? -$minor : $minor;
    }

    /** 145000 → "1450.00" (no thousands separator; the format PayHere and NUMERIC expect). */
    public static function toDecimal(int $minor): string
    {
        $sign = $minor < 0 ? '-' : '';
        $abs = abs($minor);

        return sprintf('%s%d.%02d', $sign, intdiv($abs, 100), $abs % 100);
    }

    /** 145000 → "USD 1,450.00" */
    public static function format(int $minor, string $currency = 'USD'): string
    {
        $sign = $minor < 0 ? '-' : '';
        $abs = abs($minor);

        return sprintf('%s%s %s.%02d', $sign, $currency, number_format(intdiv($abs, 100)), $abs % 100);
    }

    /** Percentage of an amount, rounded half up to the nearest cent. */
    public static function percentOf(int $minor, int $percent): int
    {
        if ($minor < 0 || $percent < 0) {
            throw new InvalidArgumentException('percentOf expects non-negative values.');
        }

        return intdiv($minor * $percent + 50, 100);
    }
}
