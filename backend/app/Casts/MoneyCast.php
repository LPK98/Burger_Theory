<?php

namespace App\Casts;

use App\Support\Money;
use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Database\Eloquent\Model;
use InvalidArgumentException;

/**
 * NUMERIC(10,2) column ⇄ integer minor units (cents).
 *
 * @implements CastsAttributes<int|null, int|null>
 */
class MoneyCast implements CastsAttributes
{
    public function get(Model $model, string $key, mixed $value, array $attributes): ?int
    {
        return $value === null ? null : Money::toMinor((string) $value);
    }

    public function set(Model $model, string $key, mixed $value, array $attributes): ?string
    {
        if ($value === null) {
            return null;
        }
        if (! is_int($value)) {
            throw new InvalidArgumentException("Money attribute [{$key}] must be an integer amount in minor units.");
        }

        return Money::toDecimal($value);
    }
}
