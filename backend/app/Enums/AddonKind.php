<?php

namespace App\Enums;

enum AddonKind: string
{
    case Topping = 'topping';
    case Sauce = 'sauce';
    case Side = 'side';
    case Extra = 'extra';

    public function label(): string
    {
        return match ($this) {
            self::Topping => 'Extra topping',
            self::Sauce => 'Sauce',
            self::Side => 'Side',
            self::Extra => 'Extra',
        };
    }
}
