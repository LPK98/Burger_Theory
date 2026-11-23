<?php

namespace App\Exceptions;

use App\Models\Addon;
use App\Models\Product;

class CartException extends ApiException
{
    public static function empty(): self
    {
        return new self('Your cart is empty.', 'cart_empty');
    }

    public static function productUnavailable(?Product $product): self
    {
        $name = $product?->name ?? 'This product';

        return new self("{$name} is not available right now.", 'product_unavailable', 422, array_filter(['product_id' => $product?->id]));
    }

    public static function insufficientStock(Product $product, int $available): self
    {
        return new self(
            $available > 0 ? "Only {$available} × {$product->name} left." : "{$product->name} is sold out.",
            'insufficient_stock',
            422,
            ['product_id' => $product->id, 'available' => max(0, $available)],
        );
    }

    public static function quantityLimit(Product $product, int $max): self
    {
        return new self("You can order at most {$max} × {$product->name}.", 'quantity_limit', 422, ['product_id' => $product->id, 'max' => $max]);
    }

    /** The add-on is deleted, switched off, or not offered for this product. */
    public static function addonUnavailable(Product $product, ?Addon $addon): self
    {
        $name = $addon?->name ?? 'That add-on';

        return new self("{$name} is not available on {$product->name} right now.", 'addon_unavailable', 422, array_filter([
            'product_id' => $product->id,
            'addon_id' => $addon?->id,
        ]));
    }

    public static function addonQuantityLimit(Product $product, Addon $addon, int $max): self
    {
        return new self(
            "You can add at most {$max} × {$addon->name} to each {$product->name}.",
            'addon_quantity_limit',
            422,
            ['product_id' => $product->id, 'addon_id' => $addon->id, 'max' => $max],
        );
    }
}
