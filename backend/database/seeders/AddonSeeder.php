<?php

namespace Database\Seeders;

use App\Enums\AddonKind;
use App\Models\Addon;
use App\Models\Product;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Starter add-ons and extra toppings, linked to the seeded burgers by category
 * (beef / chicken / plant-based). Prices are placeholders in the same scale as MenuSeeder.
 *
 * Safe to re-run: existing add-ons (even deleted ones) are left as they are, and only links
 * that don't exist yet are added, so changes made in the admin portal are kept.
 */
class AddonSeeder extends Seeder
{
    /** slug => [name, kind, price in USD cents, description] */
    private const ADDONS = [
        'extra-cheddar' => ['Extra aged cheddar', AddonKind::Topping, 150, 'Another slice of aged cheddar.'],
        'smoked-bacon' => ['Smoked bacon', AddonKind::Topping, 350, 'Two rashers of crisp smoked streaky bacon.'],
        'fried-egg' => ['Fried egg', AddonKind::Topping, 200, 'A runny-yolk fried egg.'],
        'caramelised-onions' => ['Caramelised onions', AddonKind::Topping, 150, 'Slow-cooked sweet onions.'],
        'charred-jalapenos' => ['Charred jalapeños', AddonKind::Topping, 120, 'For a little more heat.'],
        'smashed-avocado' => ['Smashed avocado', AddonKind::Topping, 300, 'Lime and sea-salt avocado.'],
        'sauteed-mushrooms' => ['Sautéed mushrooms', AddonKind::Topping, 180, 'Garlic-butter button mushrooms.'],
        'crispy-onions' => ['Crispy onion strings', AddonKind::Topping, 150, null],
        'vegan-cheddar' => ['Extra vegan cheddar', AddonKind::Topping, 180, 'Plant-based cheddar slice.'],
        'extra-beef-patty' => ['Extra smashed beef patty', AddonKind::Extra, 600, 'Make it bigger: one more smashed patty with cheese.'],
        'extra-chicken-thigh' => ['Extra crispy chicken thigh', AddonKind::Extra, 550, 'A second buttermilk-fried thigh.'],
        'gluten-free-bun' => ['Gluten-free bun', AddonKind::Extra, 250, 'Swap the bun for a gluten-free one.'],
        'theory-sauce' => ['Theory sauce', AddonKind::Sauce, 80, 'Our signature burger sauce.'],
        'chipotle-mayo' => ['Chipotle mayo', AddonKind::Sauce, 100, 'Smoky and a little spicy.'],
        'truffle-mayo' => ['Black truffle mayo', AddonKind::Sauce, 200, null],
        'bbq-sauce' => ['Smoky BBQ sauce', AddonKind::Sauce, 80, null],
        'garlic-aioli' => ['Roasted garlic aioli (vegan)', AddonKind::Sauce, 100, null],
        'side-fries' => ['Side of skin-on fries', AddonKind::Side, 450, 'Make it a meal.'],
    ];

    /** Which add-ons each kind of burger offers: slug => max per burger. */
    private const BY_BURGER = [
        'beef' => [
            'extra-beef-patty' => 2, 'extra-cheddar' => 2, 'smoked-bacon' => 2, 'fried-egg' => 1,
            'caramelised-onions' => 1, 'charred-jalapenos' => 1, 'smashed-avocado' => 1, 'sauteed-mushrooms' => 1,
            'crispy-onions' => 1, 'gluten-free-bun' => 1,
            'theory-sauce' => 2, 'chipotle-mayo' => 2, 'truffle-mayo' => 2, 'bbq-sauce' => 2,
            'side-fries' => 2,
        ],
        'chicken' => [
            'extra-chicken-thigh' => 1, 'extra-cheddar' => 2, 'smoked-bacon' => 2, 'fried-egg' => 1,
            'charred-jalapenos' => 1, 'smashed-avocado' => 1, 'gluten-free-bun' => 1,
            'theory-sauce' => 2, 'chipotle-mayo' => 2, 'bbq-sauce' => 2, 'garlic-aioli' => 2,
            'side-fries' => 2,
        ],
        'plant' => [
            'vegan-cheddar' => 2, 'smashed-avocado' => 1, 'caramelised-onions' => 1, 'charred-jalapenos' => 1,
            'sauteed-mushrooms' => 1, 'gluten-free-bun' => 1,
            'garlic-aioli' => 2, 'bbq-sauce' => 2,
            'side-fries' => 2,
        ],
    ];

    public function run(): void
    {
        $addons = [];
        $position = 0;
        foreach (self::ADDONS as $slug => [$name, $kind, $cents, $description]) {
            $addons[$slug] = Addon::withTrashed()->firstOrCreate(['slug' => $slug], [
                'name' => $name,
                'kind' => $kind,
                'price' => $cents,
                'description' => $description,
                'is_available' => true,
                'sort_order' => ++$position,
            ]);
        }

        $products = Product::query()->with('categories')->get();
        foreach ($products as $product) {
            $slugs = $product->categories->pluck('slug');
            $type = match (true) {
                $slugs->contains('plant') => 'plant',
                $slugs->contains('chicken') => 'chicken',
                $slugs->contains('beef') => 'beef',
                default => null,
            };
            if ($type === null) {
                continue;
            }

            $linked = DB::table('addon_product')->where('product_id', $product->id)->pluck('addon_id')->map(fn ($id) => (int) $id)->all();
            $sort = 0;
            $attach = [];
            foreach (self::BY_BURGER[$type] as $slug => $max) {
                $addon = $addons[$slug];
                $sort++;
                if ($addon->trashed() || in_array($addon->id, $linked, true)) {
                    continue;
                }
                // The triple-patty stack already has three patties; one more is plenty.
                $attach[$addon->id] = [
                    'max_quantity' => $product->slug === 'ultimate-stack' && $slug === 'extra-beef-patty' ? 1 : $max,
                    'sort_order' => $sort,
                ];
            }

            if ($attach !== []) {
                $product->addons()->attach($attach);
            }
        }
    }
}
