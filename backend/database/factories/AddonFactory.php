<?php

namespace Database\Factories;

use App\Enums\AddonKind;
use App\Models\Addon;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * Prices are integer cents.
 *
 * @extends Factory<Addon>
 */
class AddonFactory extends Factory
{
    /** @return array<string, mixed> */
    public function definition(): array
    {
        $name = 'Extra '.fake()->unique()->words(2, true);

        return [
            'slug' => Str::slug($name),
            'name' => ucfirst($name),
            'description' => null,
            'kind' => AddonKind::Topping,
            'price' => fake()->numberBetween(1, 6) * 5000,
            'is_available' => true,
            'sort_order' => 0,
        ];
    }

    public function price(int $cents): static
    {
        return $this->state(fn () => ['price' => $cents]);
    }

    public function unavailable(): static
    {
        return $this->state(fn () => ['is_available' => false]);
    }

    public function kind(AddonKind $kind): static
    {
        return $this->state(fn () => ['kind' => $kind]);
    }
}
