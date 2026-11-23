<?php

namespace Database\Factories;

use App\Enums\DiscountType;
use App\Models\Coupon;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Coupon>
 */
class CouponFactory extends Factory
{
    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'code' => strtoupper(fake()->unique()->bothify('SAVE##??')),
            'description' => '10% off',
            'discount_type' => DiscountType::Percentage,
            'percentage' => 10,
            'amount' => null,
            'max_discount_amount' => null,
            'min_order_amount' => null,
            'usage_limit' => null,
            'usage_limit_per_user' => null,
            'starts_at' => null,
            'expires_at' => null,
            'is_active' => true,
            'is_public' => false,
        ];
    }

    public function percentage(int $percent, ?int $cap = null): static
    {
        return $this->state(fn () => ['discount_type' => DiscountType::Percentage, 'percentage' => $percent, 'amount' => null, 'max_discount_amount' => $cap]);
    }

    /** @param int $cents Fixed discount in cents. */
    public function fixed(int $cents): static
    {
        return $this->state(fn () => ['discount_type' => DiscountType::Fixed, 'amount' => $cents, 'percentage' => null, 'description' => 'Fixed discount']);
    }
}
