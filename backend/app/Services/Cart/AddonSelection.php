<?php

namespace App\Services\Cart;

use App\Exceptions\CartException;
use App\Models\Addon;
use App\Models\CartItem;
use App\Models\Product;

/**
 * The add-ons chosen for one cart line, and the rules they must satisfy: every add-on exists,
 * is switched on, is offered by the product, and is within the product's per-burger maximum.
 * The same rules run when an item is added, when a cart is shown, and again at checkout.
 *
 * A selection is a list of ['addon' => Addon, 'quantity' => int] (quantity per burger).
 */
final class AddonSelection
{
    /**
     * Canonical key for a combination of add-ons: "3:1,7:2" sorted by add-on id; '' for none.
     *
     * @param  array<int, int>  $quantities  add-on id => quantity
     */
    public static function key(array $quantities): string
    {
        ksort($quantities);

        return implode(',', array_map(fn (int $id, int $qty) => "{$id}:{$qty}", array_keys($quantities), $quantities));
    }

    /**
     * Turns a request's add-on choices into a selection, or throws if any of them can't be ordered.
     *
     * @param  array<int, int>  $quantities  add-on id => quantity
     * @return list<array{addon: Addon, quantity: int}>
     */
    public function resolve(Product $product, array $quantities): array
    {
        if ($quantities === []) {
            return [];
        }

        $addons = Addon::withTrashed()->whereIn('id', array_keys($quantities))->get()->keyBy('id');

        $selection = [];
        foreach ($quantities as $id => $quantity) {
            $addon = $addons->get($id);
            if ($addon === null) {
                throw CartException::addonUnavailable($product, null);
            }
            $selection[] = ['addon' => $addon, 'quantity' => $quantity];
        }

        if ($problem = $this->problem($product, $selection)) {
            throw $problem;
        }

        return $selection;
    }

    /**
     * The first reason this selection can't be ordered with the product, or null when it can.
     * The product's `addons` relation is loaded if it isn't already.
     *
     * @param  list<array{addon: Addon, quantity: int}>  $selection
     */
    public function problem(Product $product, array $selection): ?CartException
    {
        if ($selection === []) {
            return null;
        }

        $offered = $product->loadMissing('addons')->addons->keyBy('id');
        foreach ($selection as ['addon' => $addon, 'quantity' => $quantity]) {
            $offer = $offered->get($addon->id);
            if ($offer === null || $addon->trashed() || ! $addon->is_available) {
                return CartException::addonUnavailable($product, $addon);
            }
            $max = (int) $offer->pivot->max_quantity;
            if ($quantity > $max) {
                return CartException::addonQuantityLimit($product, $addon, $max);
            }
        }

        return null;
    }

    /**
     * The selection stored on a cart line (its `addons` relation is loaded if needed).
     *
     * @return list<array{addon: Addon, quantity: int}>
     */
    public function fromCartItem(CartItem $item): array
    {
        return $item->loadMissing('addons')->addons
            ->map(fn (Addon $addon) => ['addon' => $addon, 'quantity' => (int) $addon->pivot->quantity])
            ->values()
            ->all();
    }

    /**
     * add-on id => quantity, as stored in cart_item_addons.
     *
     * @param  list<array{addon: Addon, quantity: int}>  $selection
     * @return array<int, int>
     */
    public static function quantities(array $selection): array
    {
        $quantities = [];
        foreach ($selection as ['addon' => $addon, 'quantity' => $quantity]) {
            $quantities[$addon->id] = $quantity;
        }

        return $quantities;
    }
}
