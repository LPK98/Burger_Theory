<?php

namespace Database\Seeders;

use App\Enums\InventoryReason;
use App\Models\Category;
use App\Models\InventoryLog;
use App\Models\Product;
use Illuminate\Database\Seeder;

/**
 * The menu from the storefront (Burger_frontend/src/data/products.ts), with the same
 * slugs so the frontend's product ids map 1:1 onto API products.
 *
 * PRICES ARE PLACEHOLDERS: the frontend number (e.g. 1450) is taken as LKR 1,450.00.
 * Set real prices through PUT /api/v1/admin/products/{id} before launch.
 * Images point at the frontend's own /images/products/*.svg until real photos are
 * uploaded to Cloudinary.
 *
 * Idempotent: re-running updates the rows instead of duplicating them.
 */
class MenuSeeder extends Seeder
{
    private const CATEGORIES = [
        ['slug' => 'beef', 'name' => 'Beef', 'sort_order' => 1],
        ['slug' => 'chicken', 'name' => 'Chicken', 'sort_order' => 2],
        ['slug' => 'spicy', 'name' => 'Spicy', 'sort_order' => 3],
        ['slug' => 'plant', 'name' => 'Plant-based', 'sort_order' => 4],
    ];

    private const PRODUCTS = [
        ['theory-classic', 'The Theory Classic', 'Double smashed beef, aged cheddar, fresh lettuce, vine tomato, signature sauce and our toasted brioche bun.', 1450, 'Double cheeseburger with lettuce and tomato on a sesame brioche bun', ['beef'], 'Signature', true],
        ['double-trouble', 'Double Trouble', 'Two smashed patties, double American cheese, house pickles, raw red onion and Theory sauce.', 1690, 'Double cheeseburger with pickles and red onion rings', ['beef'], null, false],
        ['fire-house', 'Fire House Burger', 'Smashed beef, pepper jack, charred jalapeños, chipotle mayo and a tangle of crispy onions.', 1590, 'Burger with pepper jack, jalapeño slices and crispy onions', ['beef', 'spicy'], 'Hot', false],
        ['crispy-chicken', 'Crispy Chicken', 'Buttermilk-brined thigh fried twice, crisp lettuce, house pickles and honey mustard on a potato bun.', 1390, 'Fried chicken burger with lettuce and pickles on a potato bun', ['chicken'], null, false],
        ['cheese-overload', 'Cheese Overload', 'Two patties, aged cheddar, smoked gouda and a ladle of molten cheese sauce. Napkins included.', 1650, 'Double burger dripping with cheddar, gouda and cheese sauce', ['beef'], null, false],
        ['ultimate-stack', 'The Ultimate Stack', 'Three patties, three cheeses, smoked bacon, onion rings and BBQ sauce. Built to share, rarely shared.', 2100, 'Tall triple burger with bacon, onion rings and three cheeses', ['beef'], 'For two', true],
        ['nashville-heat', 'Nashville Heat', 'Cayenne-oil fried chicken, buttermilk slaw and pickles on a soft potato bun.', 1490, 'Spicy red fried chicken burger with slaw', ['chicken', 'spicy'], 'Hot', false],
        ['garden-theory', 'Garden Theory', 'Beetroot and black bean patty, vegan cheddar, tomato, lettuce and roasted garlic aioli.', 1350, 'Plant-based burger with tomato and lettuce', ['plant'], 'Plant-based', false],
        ['truffle-shroom', 'Truffle Shroom', 'Smashed beef, Swiss cheese, sautéed mushrooms, peppery rocket and black truffle mayo.', 1750, 'Burger with Swiss cheese, mushrooms and rocket on a brioche bun', ['beef'], null, false],
    ];

    private const OPENING_STOCK = 50;

    public function run(): void
    {
        $categories = [];
        foreach (self::CATEGORIES as $category) {
            $categories[$category['slug']] = Category::query()->updateOrCreate(
                ['slug' => $category['slug']],
                ['name' => $category['name'], 'sort_order' => $category['sort_order'], 'is_active' => true],
            );
        }

        foreach (self::PRODUCTS as $position => [$slug, $name, $description, $rupees, $alt, $categorySlugs, $badge, $featured]) {
            $product = Product::query()->where('slug', $slug)->first();
            $isNew = $product === null;

            $product ??= new Product(['slug' => $slug, 'stock_quantity' => self::OPENING_STOCK]);
            $product->fill([
                'name' => $name,
                'description' => $description,
                'price' => $rupees * 100,
                'badge' => $badge,
                'is_featured' => $featured,
                'is_available' => true,
                'track_stock' => true,
                'sort_order' => $position + 1,
            ])->save();

            $product->categories()->sync(array_map(fn ($s) => $categories[$s]->id, $categorySlugs));

            $product->images()->updateOrCreate(
                ['url' => "/images/products/{$slug}.svg"],
                ['alt_text' => $alt, 'width' => 1000, 'height' => 1000, 'is_primary' => true, 'sort_order' => 0],
            );

            if ($isNew) {
                InventoryLog::query()->create([
                    'product_id' => $product->id,
                    'change' => self::OPENING_STOCK,
                    'quantity_before' => 0,
                    'quantity_after' => self::OPENING_STOCK,
                    'reason' => InventoryReason::Restock,
                    'note' => 'Opening stock (seed)',
                ]);
            }
        }
    }
}
