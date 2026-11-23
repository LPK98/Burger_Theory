<?php

namespace App\Enums;

enum PaymentMethod: string
{
    case PayHere = 'payhere';
    case CashOnDelivery = 'cod';

    public function label(): string
    {
        return match ($this) {
            self::PayHere => 'PayHere (card / online)',
            self::CashOnDelivery => 'Cash on delivery',
        };
    }
}
