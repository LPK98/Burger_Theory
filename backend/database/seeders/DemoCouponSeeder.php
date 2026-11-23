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
            'description' => '10% off your first order (max $5)',
            'discount_type' => DiscountType::Percentage,
            'percentage' => 10,
            'max_discount_amount' => 500,
            'min_order_amount' => 1500,
            'usage_limit_per_user' => 1,
            'is_active' => true,
            'is_public' => true,
        ]);

        Coupon::query()->firstOrCreate(['code' => 'STACK300'], [
            'description' => '$3 off orders over $40',
            'discount_type' => DiscountType::Fixed,
            'amount' => 300,
            'min_order_amount' => 4000,
            'is_active' => true,
            'is_public' => false,
        ]);

        // A time-boxed campaign: advertised on GET /offers while it runs, with an overall cap.
        Coupon::query()->firstOrCreate(['code' => 'BURGERWEEK'], [
            'description' => 'Burger Week: 20% off any order (max $8), twice per customer',
            'discount_type' => DiscountType::Percentage,
            'percentage' => 20,
            'max_discount_amount' => 800,
            'min_order_amount' => 2000,
            'usage_limit' => 500,
            'usage_limit_per_user' => 2,
            'starts_at' => now()->startOfDay(),
            'expires_at' => now()->startOfDay()->addDays(30),
            'is_active' => true,
            'is_public' => true,
        ]);
    }
}
