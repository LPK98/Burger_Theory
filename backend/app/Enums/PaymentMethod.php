<?php

namespace App\Enums;

enum PaymentMethod: string
{
    case PayHere = 'payhere';
    case Stripe = 'stripe';
    case CashOnDelivery = 'cod';

    public function label(): string
    {
        return match ($this) {
            self::PayHere => 'PayHere (card / online)',
            self::Stripe => 'Card (Stripe)',
            self::CashOnDelivery => 'Cash on delivery',
        };
    }

    /** Paid through a gateway before the kitchen starts, rather than in cash on arrival. */
    public function isOnline(): bool
    {
        return $this !== self::CashOnDelivery;
    }

    /** The restaurant setting that switches this method on or off. */
    public function settingKey(): string
    {
        return match ($this) {
            self::PayHere => 'payhere_enabled',
            self::Stripe => 'stripe_enabled',
            self::CashOnDelivery => 'cod_enabled',
        };
    }

    /** @return list<string> */
    public static function onlineValues(): array
    {
        return array_values(array_map(fn (self $m) => $m->value, array_filter(self::cases(), fn (self $m) => $m->isOnline())));
    }
}
