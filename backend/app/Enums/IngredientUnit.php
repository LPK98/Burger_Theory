<?php

namespace App\Enums;

enum IngredientUnit: string
{
    case Grams = 'g';
    case Kilograms = 'kg';
    case Millilitres = 'ml';
    case Litres = 'l';
    case Pieces = 'pcs';

    public function label(): string
    {
        return match ($this) {
            self::Grams => 'Grams',
            self::Kilograms => 'Kilograms',
            self::Millilitres => 'Millilitres',
            self::Litres => 'Litres',
            self::Pieces => 'Pieces',
        };
    }
}
