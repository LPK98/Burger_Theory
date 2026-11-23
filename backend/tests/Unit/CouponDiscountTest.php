<?php

namespace Tests\Unit;

use App\Enums\DiscountType;
use App\Exceptions\CouponException;
use App\Models\Coupon;
use App\Services\Coupon\CouponService;
use Tests\TestCase;

/** Discount maths and rule checks that need no database (guest checks only). */
class CouponDiscountTest extends TestCase
{
    private CouponService $coupons;

    protected function setUp(): void
    {
        parent::setUp();
        $this->coupons = new CouponService;
    }

    public function test_percentage_discount_with_cap(): void
    {
        $coupon = $this->coupon(['discount_type' => DiscountType::Percentage, 'percentage' => 10]);
        $this->assertSame(29000, $this->coupons->discountFor($coupon, 290000));

        $coupon->max_discount_amount = 20000;
        $this->assertSame(20000, $this->coupons->discountFor($coupon, 290000));
    }

    public function test_fixed_discount_never_exceeds_subtotal(): void
    {
        $coupon = $this->coupon(['discount_type' => DiscountType::Fixed, 'amount' => 50000]);
        $this->assertSame(50000, $this->coupons->discountFor($coupon, 290000));
        $this->assertSame(30000, $this->coupons->discountFor($coupon, 30000));
    }

    public function test_rejects_expired_inactive_not_started_exhausted_and_below_minimum(): void
    {
        $cases = [
            'coupon_expired' => ['expires_at' => now()->subMinute()],
            'coupon_inactive' => ['is_active' => false],
            'coupon_not_started' => ['starts_at' => now()->addDay()],
            'coupon_exhausted' => ['usage_limit' => 5, 'times_used' => 5],
            'coupon_minimum_not_met' => ['min_order_amount' => 300000],
        ];

        foreach ($cases as $code => $state) {
            try {
                $this->coupons->assertUsable($this->coupon($state), 290000, null);
                $this->fail("Expected {$code}");
            } catch (CouponException $e) {
                $this->assertSame($code, $e->errorCode);
            }
        }
    }

    public function test_accepts_a_valid_coupon(): void
    {
        $this->coupons->assertUsable($this->coupon(['min_order_amount' => 290000, 'expires_at' => now()->addDay()]), 290000, null);
        $this->addToAssertionCount(1);
    }

    private function coupon(array $attributes): Coupon
    {
        $coupon = new Coupon(array_intersect_key($attributes + [
            'code' => 'TEST', 'discount_type' => DiscountType::Percentage, 'percentage' => 10, 'is_active' => true,
        ], array_flip((new Coupon)->getFillable())));
        $coupon->forceFill(array_diff_key($attributes, array_flip((new Coupon)->getFillable())));

        return $coupon;
    }
}
