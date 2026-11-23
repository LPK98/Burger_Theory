<?php

namespace App\Services\Order;

use App\Models\Order;
use RuntimeException;

/**
 * Human-friendly, non-sequential order numbers such as BT-261122-7KQ2XM.
 * Non-sequential so they reveal nothing about order volume; the unique index is the final guard.
 */
class OrderNumberGenerator
{
    private const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

    public function generate(): string
    {
        $date = now(config('restaurant.timezone'))->format('ymd');

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $candidate = "BT-{$date}-".$this->randomCode(6);
            if (! Order::query()->where('order_number', $candidate)->exists()) {
                return $candidate;
            }
        }

        throw new RuntimeException('Could not generate a unique order number.');
    }

    private function randomCode(int $length): string
    {
        $code = '';
        $max = strlen(self::ALPHABET) - 1;
        for ($i = 0; $i < $length; $i++) {
            $code .= self::ALPHABET[random_int(0, $max)];
        }

        return $code;
    }
}
