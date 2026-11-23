<?php

namespace Database\Seeders;

use App\Enums\DiscountType;
use App\Models\Coupon;
use Illuminate\Database\Seeder;

/** Example coupons for local development. Not run in production. */
class DemoCouponSeeder extends Seeder
{
    public function run(): void
    {
        Coupon::query()->firstOrCreate(['code' => 'WELCOME10'], [
            'description' => '10% off your first order (max LKR 500)',
            'discount_type' => DiscountType::Percentage,
            'percentage' => 10,
            'max_discount_amount' => 50000,
            'min_order_amount' => 150000,
            'usage_limit_per_user' => 1,
            'is_active' => true,
            'is_public' => true,
        ]);

        Coupon::query()->firstOrCreate(['code' => 'STACK300'], [
            'description' => 'LKR 300 off orders over LKR 4,000',
            'discount_type' => DiscountType::Fixed,
            'amount' => 30000,
            'min_order_amount' => 400000,
            'is_active' => true,
            'is_public' => false,
        ]);

        // A time-boxed campaign: advertised on GET /offers while it runs, with an overall cap.
        Coupon::query()->firstOrCreate(['code' => 'BURGERWEEK'], [
            'description' => 'Burger Week: 20% off any order (max LKR 800), twice per customer',
            'discount_type' => DiscountType::Percentage,
            'percentage' => 20,
            'max_discount_amount' => 80000,
            'min_order_amount' => 200000,
            'usage_limit' => 500,
            'usage_limit_per_user' => 2,
            'starts_at' => now()->startOfDay(),
            'expires_at' => now()->startOfDay()->addDays(30),
            'is_active' => true,
            'is_public' => true,
        ]);
    }
}
