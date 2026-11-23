<?php

namespace App\Services\Cart;

use App\Models\Addon;
use App\Models\CartItem;
use App\Models\Product;

final readonly class QuoteLine
{
    /**
     * @param  int  $unitPrice  One burger as ordered: product price + add-ons.
     * @param  list<array{addon: Addon, quantity: int, unit_price: int}>  $addons  Quantity is per burger.
     * @param  int  $addonsUnitPrice  The add-on part of $unitPrice.
     */
    public function __construct(
        public ?CartItem $item,
        public Product $product,
        public int $quantity,
        public int $unitPrice,
        public int $lineTotal,
        /** 'product_unavailable' | 'insufficient_stock' | 'addon_unavailable' | null */
        public ?string $issue = null,
        public array $addons = [],
        public int $addonsUnitPrice = 0,
    ) {}

    /** Unavailable lines stay visible in the cart but do not count towards the totals. */
    public function countsTowardsTotal(): bool
    {
        return $this->issue !== 'product_unavailable';
    }

    /** The product's own price, without add-ons. */
    public function basePrice(): int
    {
        return $this->unitPrice - $this->addonsUnitPrice;
    }
}
