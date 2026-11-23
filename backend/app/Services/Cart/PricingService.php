<?php

namespace App\Services\Cart;

use App\Enums\FulfilmentType;
use App\Exceptions\CouponException;
use App\Models\Addon;
use App\Models\Cart;
use App\Models\CartItem;
use App\Models\Coupon;
use App\Models\Product;
use App\Models\User;
use App\Services\Coupon\CouponService;
use App\Services\Settings\RestaurantSettings;
use App\Support\Money;

/**
 * The single place where cart and order totals are calculated. Prices always come from
 * the products table; nothing the client sends is ever used as a price or total.
 */
class PricingService
{
    public function __construct(
        private readonly RestaurantSettings $settings,
        private readonly CouponService $coupons,
        private readonly AddonSelection $addons,
    ) {}

    /** Quote for showing a cart. Never throws for business rules; problems are reported as issues. */
    public function quoteCart(Cart $cart, FulfilmentType $fulfilment, ?User $user): Quote
    {
        $cart->loadMissing(['items.product.primaryImage', 'items.product.addons', 'items.addons', 'coupon']);

        // One product can be on several lines (with different add-ons); stock covers them all.
        $wanted = [];
        foreach ($cart->items as $item) {
            $wanted[$item->product_id] = ($wanted[$item->product_id] ?? 0) + $item->quantity;
        }

        $lines = [];
        foreach ($cart->items as $item) {
            $product = $item->product;
            if ($product === null) {
                continue;
            }
            $selection = $this->addons->fromCartItem($item);
            $issue = match (true) {
                $product->trashed(), ! $product->is_available => 'product_unavailable',
                $product->track_stock && $product->stock_quantity < $wanted[$product->id] => 'insufficient_stock',
                $this->addons->problem($product, $selection) !== null => 'addon_unavailable',
                default => null,
            };
            $lines[] = $this->line($product, $item->quantity, $selection, $item, $issue);
        }

        return $this->quote($lines, $fulfilment, $cart->coupon, $user);
    }

    /**
     * @param  list<QuoteLine>  $lines
     */
    public function quote(array $lines, FulfilmentType $fulfilment, ?Coupon $coupon, ?User $user): Quote
    {
        $issues = [];
        foreach ($lines as $line) {
            if ($line->issue === 'product_unavailable') {
                $issues[] = ['code' => 'product_unavailable', 'message' => "{$line->product->name} is no longer available. Remove it to continue.", 'product_id' => $line->product->id];
            } elseif ($line->issue === 'insufficient_stock') {
                $issues[] = ['code' => 'insufficient_stock', 'message' => "Only {$line->product->stock_quantity} × {$line->product->name} left.", 'product_id' => $line->product->id];
            } elseif ($line->issue === 'addon_unavailable') {
                $issues[] = ['code' => 'addon_unavailable', 'message' => "The extras on {$line->product->name} have changed. Remove it and add it again.", 'product_id' => $line->product->id];
            }
        }

        $subtotal = $this->subtotal($lines);

        $discount = 0;
        $couponError = null;
        if ($coupon !== null) {
            try {
                $this->coupons->assertUsable($coupon, $subtotal, $user);
                $discount = $this->coupons->discountFor($coupon, $subtotal);
            } catch (CouponException $e) {
                $couponError = ['code' => $e->errorCode, 'message' => $e->getMessage()];
            }
        }

        $hasCountableLines = array_filter($lines, fn (QuoteLine $line) => $line->countsTowardsTotal()) !== [];
        $deliveryFee = $hasCountableLines ? $this->deliveryFee($fulfilment, $subtotal - $discount) : 0;
        $minimum = $this->settings->minimumOrderAmount();

        if ($lines !== [] && $subtotal < $minimum) {
            $issues[] = ['code' => 'below_minimum_order', 'message' => 'The minimum order is '.Money::format($minimum).'.'];
        }
        if (! $this->settings->acceptingOrders()) {
            $issues[] = ['code' => 'not_accepting_orders', 'message' => 'We are not accepting online orders right now.'];
        }
        if (! $this->settings->fulfilmentEnabled($fulfilment)) {
            $issues[] = ['code' => 'fulfilment_unavailable', 'message' => ucfirst($fulfilment->value).' is not available right now.'];
        }

        return new Quote(
            lines: $lines,
            subtotal: $subtotal,
            discount: $discount,
            deliveryFee: $deliveryFee,
            total: $subtotal - $discount + $deliveryFee,
            fulfilment: $fulfilment,
            coupon: $coupon,
            couponError: $couponError,
            issues: $issues,
            minimumOrderAmount: $minimum,
            freeDeliveryThreshold: $this->settings->freeDeliveryThreshold(),
            currency: config('restaurant.currency'),
        );
    }

    /**
     * @param  list<QuoteLine>  $lines
     */
    public function subtotal(array $lines): int
    {
        $sum = 0;
        foreach ($lines as $line) {
            if ($line->countsTowardsTotal()) {
                $sum += $line->lineTotal;
            }
        }

        return $sum;
    }

    /** Flat fee, waived when the discounted subtotal reaches the free-delivery threshold. */
    public function deliveryFee(FulfilmentType $fulfilment, int $discountedSubtotal): int
    {
        if ($fulfilment === FulfilmentType::Pickup) {
            return 0;
        }

        $threshold = $this->settings->freeDeliveryThreshold();
        if ($threshold !== null && $discountedSubtotal >= $threshold) {
            return 0;
        }

        return $this->settings->deliveryFee();
    }

    /**
     * Prices one line from the database: (product price + Σ add-on price × add-on quantity) × quantity.
     *
     * @param  list<array{addon: Addon, quantity: int}>  $addons  Quantity is per burger.
     */
    public function line(Product $product, int $quantity, array $addons = [], ?CartItem $item = null, ?string $issue = null): QuoteLine
    {
        $addonsUnitPrice = 0;
        $priced = [];
        foreach ($addons as ['addon' => $addon, 'quantity' => $addonQuantity]) {
            $addonsUnitPrice += $addon->price * $addonQuantity;
            $priced[] = ['addon' => $addon, 'quantity' => $addonQuantity, 'unit_price' => $addon->price];
        }
        $unitPrice = $product->price + $addonsUnitPrice;

        return new QuoteLine($item, $product, $quantity, $unitPrice, $unitPrice * $quantity, $issue, $priced, $addonsUnitPrice);
    }
}
