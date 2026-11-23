<?php

namespace App\Services\Cart;

use App\Enums\FulfilmentType;
use App\Exceptions\CartException;
use App\Models\Cart;
use App\Models\CartItem;
use App\Models\Coupon;
use App\Models\Product;
use App\Models\User;
use App\Services\Coupon\CouponService;
use Illuminate\Support\Facades\DB;

class CartService
{
    public function __construct(
        private readonly CouponService $coupons,
        private readonly PricingService $pricing,
        private readonly AddonSelection $addons,
    ) {}

    /**
     * Adds to the existing line for this product with exactly these add-ons, or creates one.
     *
     * @param  array<int, int>  $addonQuantities  add-on id => quantity per burger
     */
    public function add(Cart $cart, Product $product, int $quantity, array $addonQuantities = []): CartItem
    {
        return DB::transaction(function () use ($cart, $product, $quantity, $addonQuantities) {
            $this->lock($cart);

            $this->addons->resolve($product, $addonQuantities);
            $key = AddonSelection::key($addonQuantities);

            $item = $cart->items()->where('product_id', $product->id)->where('options_key', $key)->first();
            $newQuantity = ($item?->quantity ?? 0) + $quantity;
            $this->assertCanHold($product, $newQuantity, $this->quantityOnOtherLines($cart, $product, $item));

            if ($item === null) {
                $item = $cart->items()->create(['product_id' => $product->id, 'quantity' => $newQuantity, 'options_key' => $key]);
                $item->addons()->attach(array_map(fn (int $q) => ['quantity' => $q], $addonQuantities));

                return $item;
            }

            $item->update(['quantity' => $newQuantity]);

            return $item;
        });
    }

    public function setQuantity(Cart $cart, CartItem $item, int $quantity): CartItem
    {
        return DB::transaction(function () use ($cart, $item, $quantity) {
            $this->lock($cart);
            $product = $item->product;
            if ($product === null) {
                throw CartException::productUnavailable(null);
            }
            $this->assertCanHold($product, $quantity, $this->quantityOnOtherLines($cart, $product, $item));
            $item->update(['quantity' => $quantity]);

            return $item;
        });
    }

    public function remove(CartItem $item): void
    {
        $item->delete();
    }

    public function clear(Cart $cart): void
    {
        DB::transaction(function () use ($cart) {
            $this->lock($cart);
            $cart->items()->delete();
            $cart->update(['coupon_id' => null]);
        });
    }

    public function applyCoupon(Cart $cart, string $code, ?User $user): Coupon
    {
        $coupon = $this->coupons->findByCode($code);
        $subtotal = $this->pricing->quoteCart($cart, FulfilmentType::Delivery, $user)->subtotal;
        $this->coupons->assertUsable($coupon, $subtotal, $user);

        $cart->coupon()->associate($coupon)->save();

        return $coupon;
    }

    public function removeCoupon(Cart $cart): void
    {
        $cart->coupon()->dissociate()->save();
    }

    /**
     * Moves a guest cart into the customer's cart after sign-in. Lines with the same product
     * and add-ons are added together and capped at what can be ordered; unavailable products,
     * and lines whose add-ons can no longer be ordered, are dropped.
     */
    public function merge(Cart $guest, Cart $target): Cart
    {
        if ($guest->is($target)) {
            return $target;
        }

        DB::transaction(function () use ($guest, $target) {
            $this->lock($target);
            $guest->load(['items.product.addons', 'items.addons']);

            foreach ($guest->items as $guestItem) {
                $product = $guestItem->product;
                if ($product === null || ! $product->isPurchasable()) {
                    continue;
                }
                $selection = $this->addons->fromCartItem($guestItem);
                if ($this->addons->problem($product, $selection) !== null) {
                    continue;
                }

                $key = AddonSelection::key(AddonSelection::quantities($selection));
                $line = $target->items()->firstOrNew(['product_id' => $product->id, 'options_key' => $key]);
                $quantity = min(($line->quantity ?? 0) + $guestItem->quantity, $product->maxOrderableQuantity());
                if ($quantity < 1) {
                    continue;
                }

                $isNew = ! $line->exists;
                $line->quantity = $quantity;
                $line->save();
                if ($isNew && $selection !== []) {
                    $line->addons()->attach(array_map(fn (int $q) => ['quantity' => $q], AddonSelection::quantities($selection)));
                }
            }

            if ($target->coupon_id === null && $guest->coupon_id !== null) {
                $target->update(['coupon_id' => $guest->coupon_id]);
            }

            $guest->delete();
        });

        return $target->refresh();
    }

    /**
     * @param  int  $quantity  The line's new quantity (capped per line).
     * @param  int  $onOtherLines  The same product on the cart's other lines (with other add-ons);
     *                             stock has to cover all of them.
     */
    public function assertCanHold(Product $product, int $quantity, int $onOtherLines = 0): void
    {
        if (! $product->is_available || $product->trashed()) {
            throw CartException::productUnavailable($product);
        }

        $cap = (int) config('restaurant.cart.max_quantity_per_item');
        if ($quantity > $cap) {
            throw CartException::quantityLimit($product, $cap);
        }

        if ($product->track_stock && $quantity + $onOtherLines > $product->stock_quantity) {
            throw CartException::insufficientStock($product, max(0, $product->stock_quantity - $onOtherLines));
        }
    }

    private function quantityOnOtherLines(Cart $cart, Product $product, ?CartItem $except): int
    {
        return (int) $cart->items()
            ->where('product_id', $product->id)
            ->when($except !== null, fn ($q) => $q->whereKeyNot($except->id))
            ->sum('quantity');
    }

    /** Serialises concurrent edits of one cart. */
    private function lock(Cart $cart): void
    {
        Cart::query()->whereKey($cart->id)->lockForUpdate()->first();
    }
}
