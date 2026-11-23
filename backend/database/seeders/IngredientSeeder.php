<?php

namespace Database\Seeders;

use App\Models\Ingredient;
use App\Models\Product;
use App\Services\Inventory\IngredientService;
use Illuminate\Database\Seeder;

/**
 * Starter kitchen ingredients and a recipe for each burger on the seeded menu.
 *
 * Safe to run more than once: existing ingredients (matched by name) are left alone, and
 * a product that already has a recipe keeps it.
 */
class IngredientSeeder extends Seeder
{
    /** name => [unit, opening stock, minimum level] */
    public const INGREDIENTS = [
        'Brioche bun' => ['pcs', 180, 60],
        'Potato bun' => ['pcs', 90, 35],
        'Beef patty (90 g)' => ['pcs', 320, 120],
        'Buttermilk chicken thigh' => ['pcs', 90, 35],
        'Beetroot and black bean patty' => ['pcs', 40, 15],
        'Aged cheddar slice' => ['pcs', 260, 90],
        'American cheese slice' => ['pcs', 200, 70],
        'Pepper jack slice' => ['pcs', 90, 30],
        'Smoked gouda slice' => ['pcs', 70, 25],
        'Swiss cheese slice' => ['pcs', 60, 20],
        'Vegan cheddar slice' => ['pcs', 40, 15],
        'Cheese sauce' => ['ml', 4000, 1500],
        'Lettuce' => ['g', 5000, 1500],
        'Vine tomato' => ['g', 6000, 2000],
        'Red onion' => ['g', 3000, 1000],
        'Mushrooms' => ['g', 3000, 1000],
        'Rocket' => ['g', 800, 250],
        'Charred jalapeños' => ['g', 1500, 500],
        'Buttermilk slaw' => ['g', 3000, 1000],
        'House pickles' => ['g', 4000, 1200],
        'Crispy onions' => ['g', 1500, 500],
        'Onion rings' => ['pcs', 150, 50],
        'Smoked bacon' => ['g', 3000, 1000],
        'Theory sauce' => ['ml', 6000, 2000],
        'Chipotle mayo' => ['ml', 2000, 700],
        'Honey mustard' => ['ml', 2000, 700],
        'BBQ sauce' => ['ml', 2000, 700],
        'Roasted garlic aioli' => ['ml', 1500, 500],
        'Black truffle mayo' => ['ml', 1200, 400],
        'Cayenne oil' => ['ml', 1500, 500],
        'Burger box' => ['pcs', 500, 150],
    ];

    /** product slug => [ingredient name => amount per burger] */
    public const RECIPES = [
        'theory-classic' => ['Brioche bun' => 1, 'Beef patty (90 g)' => 2, 'Aged cheddar slice' => 2, 'Lettuce' => 20, 'Vine tomato' => 30, 'Theory sauce' => 25, 'Burger box' => 1],
        'double-trouble' => ['Brioche bun' => 1, 'Beef patty (90 g)' => 2, 'American cheese slice' => 2, 'House pickles' => 15, 'Red onion' => 15, 'Theory sauce' => 25, 'Burger box' => 1],
        'fire-house' => ['Brioche bun' => 1, 'Beef patty (90 g)' => 1, 'Pepper jack slice' => 1, 'Charred jalapeños' => 20, 'Chipotle mayo' => 20, 'Crispy onions' => 15, 'Burger box' => 1],
        'crispy-chicken' => ['Potato bun' => 1, 'Buttermilk chicken thigh' => 1, 'Lettuce' => 20, 'House pickles' => 15, 'Honey mustard' => 20, 'Burger box' => 1],
        'cheese-overload' => ['Brioche bun' => 1, 'Beef patty (90 g)' => 2, 'Aged cheddar slice' => 1, 'Smoked gouda slice' => 1, 'Cheese sauce' => 40, 'Burger box' => 1],
        'ultimate-stack' => ['Brioche bun' => 1, 'Beef patty (90 g)' => 3, 'Aged cheddar slice' => 1, 'American cheese slice' => 1, 'Pepper jack slice' => 1, 'Smoked bacon' => 40, 'Onion rings' => 3, 'BBQ sauce' => 30, 'Burger box' => 1],
        'nashville-heat' => ['Potato bun' => 1, 'Buttermilk chicken thigh' => 1, 'Cayenne oil' => 15, 'Buttermilk slaw' => 40, 'House pickles' => 15, 'Burger box' => 1],
        'garden-theory' => ['Potato bun' => 1, 'Beetroot and black bean patty' => 1, 'Vegan cheddar slice' => 1, 'Vine tomato' => 30, 'Lettuce' => 20, 'Roasted garlic aioli' => 20, 'Burger box' => 1],
        'truffle-shroom' => ['Brioche bun' => 1, 'Beef patty (90 g)' => 1, 'Swiss cheese slice' => 1, 'Mushrooms' => 50, 'Rocket' => 10, 'Black truffle mayo' => 20, 'Burger box' => 1],
    ];

    public function run(IngredientService $ingredients): void
    {
        $byName = [];
        foreach (self::INGREDIENTS as $name => [$unit, $stock, $min]) {
            $byName[$name] = Ingredient::query()->whereRaw('lower(name) = ?', [mb_strtolower($name)])->first()
                ?? $ingredients->create(['name' => $name, 'unit' => $unit, 'stock_quantity' => $stock, 'min_stock_level' => $min], null);
        }

        foreach (self::RECIPES as $slug => $recipe) {
            $product = Product::query()->where('slug', $slug)->first();
            if ($product === null || $product->ingredients()->exists()) {
                continue;
            }
            $ingredients->syncRecipe($product, collect($recipe)->map(fn ($quantity, $name) => [
                'ingredient_id' => $byName[$name]->id,
                'quantity' => $quantity,
            ])->values()->all());
        }
    }
}
