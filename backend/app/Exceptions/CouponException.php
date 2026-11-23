<?php

namespace App\Exceptions;

use App\Support\Money;

class CouponException extends ApiException
{
    public static function notFound(): self
    {
        return new self('That coupon code is not valid.', 'coupon_not_found');
    }

    public static function inactive(): self
    {
        return new self('That coupon is no longer active.', 'coupon_inactive');
    }

    public static function notStarted(): self
    {
        return new self('That coupon is not valid yet.', 'coupon_not_started');
    }

    public static function expired(): self
    {
        return new self('That coupon has expired.', 'coupon_expired');
    }

    public static function exhausted(): self
    {
        return new self('That coupon has reached its usage limit.', 'coupon_exhausted');
    }

    public static function alreadyUsed(): self
    {
        return new self('You have already used this coupon.', 'coupon_already_used');
    }

    public static function minimumNotMet(int $minimum): self
    {
        return new self(
            'This coupon needs a subtotal of at least '.Money::format($minimum).'.',
            'coupon_minimum_not_met',
            422,
            ['minimum_order_amount' => $minimum],
        );
    }
}
