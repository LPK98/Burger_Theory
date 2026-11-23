<?php

namespace Database\Factories;

use App\Models\Category;
use App\Models\Product;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * Prices are integer cents.
 *
 * @extends Factory<Product>
 */
class ProductFactory extends Factory
{
    /** @return array<string, mixed> */
    public function definition(): array
    {
        $name = ucwords(fake()->unique()->words(3, true)).' Burger';

        return [
            'slug' => Str::slug($name),
            'name' => $name,
            'description' => fake()->sentence(12),
            'price' => fake()->numberBetween(9, 25) * 10000,
            'compare_at_price' => null,
            'badge' => null,
            'is_available' => true,
            'is_featured' => false,
            'track_stock' => true,
            'stock_quantity' => 50,
            'low_stock_threshold' => 5,
            'sort_order' => 0,
        ];
    }

    public function price(int $cents): static
    {
        return $this->state(fn () => ['price' => $cents]);
    }

    public function stock(int $quantity): static
    {
        return $this->state(fn () => ['track_stock' => true, 'stock_quantity' => $quantity]);
    }

    public function untracked(): static
    {
        return $this->state(fn () => ['track_stock' => false, 'stock_quantity' => 0]);
    }

    public function unavailable(): static
    {
        return $this->state(fn () => ['is_available' => false]);
    }

    public function featured(): static
    {
        return $this->state(fn () => ['is_featured' => true]);
    }

    public function inCategory(Category $category): static
    {
        return $this->afterCreating(fn (Product $product) => $product->categories()->attach($category));
    }
}
