<?php

namespace App\Enums;

enum IngredientMovementReason: string
{
    /** Used by a placed order, through the product's recipe. */
    case Consumption = 'consumption';
    /** Returned because the order was cancelled, rejected or expired. */
    case OrderRelease = 'order_release';
    /** A delivery from a supplier. */
    case Restock = 'restock';
    /** A correction after a stock count. */
    case Adjustment = 'adjustment';
    /** Spoiled, dropped or expired stock. */
    case Waste = 'waste';

    public function label(): string
    {
        return match ($this) {
            self::Consumption => 'Used by order',
            self::OrderRelease => 'Returned from order',
            self::Restock => 'Restock',
            self::Adjustment => 'Stock count',
            self::Waste => 'Waste',
        };
    }

    /** Reasons an administrator can record by hand. */
    public static function manual(): array
    {
        return [self::Restock, self::Adjustment, self::Waste];
    }
}
