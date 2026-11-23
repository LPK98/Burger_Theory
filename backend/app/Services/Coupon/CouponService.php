<?php

namespace App\Services\Coupon;

use App\Enums\DiscountType;
use App\Exceptions\CouponException;
use App\Models\Coupon;
use App\Models\CouponUsage;
use App\Models\Order;
use App\Models\User;
use App\Support\Money;

class CouponService
{
    public function findByCode(string $code): Coupon
    {
        $coupon = Coupon::query()->where('code', Coupon::normalizeCode($code))->first();

        return $coupon ?? throw CouponException::notFound();
    }

    /**
     * Throws when the coupon cannot be used for this subtotal by this customer.
     * Guests are checked against global limits only; per-customer limits are enforced at checkout.
     */
    public function assertUsable(Coupon $coupon, int $subtotal, ?User $user): void
    {
        if (! $coupon->is_active || $coupon->trashed()) {
            throw CouponException::inactive();
        }
        if ($coupon->starts_at !== null && $coupon->starts_at->isFuture()) {
            throw CouponException::notStarted();
        }
        if ($coupon->expires_at !== null && ! $coupon->expires_at->isFuture()) {
            throw CouponException::expired();
        }
        if ($coupon->usage_limit !== null && $coupon->times_used >= $coupon->usage_limit) {
            throw CouponException::exhausted();
        }
        if ($user !== null && $coupon->usage_limit_per_user !== null) {
            $used = CouponUsage::query()->where('coupon_id', $coupon->id)->where('user_id', $user->id)->count();
            if ($used >= $coupon->usage_limit_per_user) {
                throw CouponException::alreadyUsed();
            }
        }
        if ($coupon->min_order_amount !== null && $subtotal < $coupon->min_order_amount) {
            throw CouponException::minimumNotMet($coupon->min_order_amount);
        }
    }

    /** Discount in minor units; never more than the subtotal. */
    public function discountFor(Coupon $coupon, int $subtotal): int
    {
        $discount = match ($coupon->discount_type) {
            DiscountType::Percentage => Money::percentOf($subtotal, (int) $coupon->percentage),
            DiscountType::Fixed => (int) $coupon->amount,
        };

        if ($coupon->discount_type === DiscountType::Percentage && $coupon->max_discount_amount !== null) {
            $discount = min($discount, $coupon->max_discount_amount);
        }

        return max(0, min($discount, $subtotal));
    }

    /** Called inside the order transaction with the coupon row locked. */
    public function recordUsage(Coupon $coupon, Order $order, User $user, int $discount): void
    {
        $coupon->increment('times_used');

        CouponUsage::query()->create([
            'coupon_id' => $coupon->id,
            'user_id' => $user->id,
            'order_id' => $order->id,
            'discount_amount' => $discount,
        ]);
    }

    /** Gives the use back when an order is cancelled or rejected. Idempotent. */
    public function releaseUsage(Order $order): void
    {
        $usage = CouponUsage::query()->where('order_id', $order->id)->lockForUpdate()->first();
        if ($usage === null) {
            return;
        }

        Coupon::withTrashed()->whereKey($usage->coupon_id)->where('times_used', '>', 0)->decrement('times_used');
        $usage->delete();
    }
}
