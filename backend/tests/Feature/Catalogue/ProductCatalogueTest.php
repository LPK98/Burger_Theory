<?php

namespace Tests\Feature\Catalogue;

use App\Models\Category;
use App\Models\Coupon;
use App\Models\Product;
use Database\Seeders\MenuSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProductCatalogueTest extends TestCase
{
    use RefreshDatabase;

    public function test_seeded_menu_matches_the_frontend_and_prices_are_in_cents(): void
    {
        $this->seed(MenuSeeder::class);

        $response = $this->getJson('/api/v1/products')->assertOk();

        $response->assertJsonCount(9, 'data')
            ->assertJsonPath('data.0.slug', 'theory-classic')
            ->assertJsonPath('data.0.price', 1450)
            ->assertJsonPath('data.0.currency', 'USD')
            ->assertJsonPath('data.0.badge', 'Signature')
            ->assertJsonPath('data.0.image.url', '/images/products/theory-classic.svg')
            ->assertJsonStructure(['data' => [['id', 'slug', 'name', 'description', 'price', 'is_available', 'in_stock', 'max_quantity', 'categories', 'rating']], 'links', 'meta']);

        $fireHouse = collect($response->json('data'))->firstWhere('slug', 'fire-house');
        $this->assertEqualsCanonicalizing(['beef', 'spicy'], array_column($fireHouse['categories'], 'slug'));
    }

    public function test_only_available_products_are_listed(): void
    {
        Product::factory()->create(['name' => 'On Menu']);
        Product::factory()->unavailable()->create(['name' => 'Hidden']);
        Product::factory()->create(['name' => 'Deleted'])->delete();
        Product::factory()->stock(0)->create(['name' => 'Sold Out']);

        $names = collect($this->getJson('/api/v1/products')->assertOk()->json('data'))->pluck('name');

        $this->assertEqualsCanonicalizing(['On Menu', 'Sold Out'], $names->all());

        $inStock = collect($this->getJson('/api/v1/products?in_stock=1')->json('data'))->pluck('name');
        $this->assertSame(['On Menu'], $inStock->all());
    }

    public function test_filters_by_category_search_featured_price_and_sale(): void
    {
        $chicken = Category::factory()->create(['slug' => 'chicken']);
        Product::factory()->inCategory($chicken)->price(139000)->create(['name' => 'Crispy Chicken']);
        Product::factory()->featured()->price(145000)->create(['name' => 'Theory Classic', 'description' => 'Aged cheddar and our sauce']);
        Product::factory()->price(210000)->create(['name' => 'Ultimate Stack', 'compare_at_price' => 250000]);

        $this->assertSame(['Crispy Chicken'], collect($this->getJson('/api/v1/products?category=chicken')->json('data'))->pluck('name')->all());
        $this->assertSame(['Theory Classic'], collect($this->getJson('/api/v1/products?search=CHEDDAR')->json('data'))->pluck('name')->all());
        $this->assertSame(['Theory Classic'], collect($this->getJson('/api/v1/products?featured=1')->json('data'))->pluck('name')->all());
        $this->assertSame(['Ultimate Stack'], collect($this->getJson('/api/v1/products?on_sale=1')->json('data'))->pluck('name')->all());
        $this->assertSame(['Crispy Chicken', 'Theory Classic'], collect($this->getJson('/api/v1/products?max_price=150000&sort=price')->json('data'))->pluck('name')->all());
        $this->assertSame(['Ultimate Stack', 'Theory Classic', 'Crispy Chicken'], collect($this->getJson('/api/v1/products?sort=-price')->json('data'))->pluck('name')->all());

        // LIKE wildcards in a search are treated literally.
        $this->assertSame([], $this->getJson('/api/v1/products?search=%25')->json('data'));
    }

    public function test_invalid_filters_are_rejected(): void
    {
        $this->getJson('/api/v1/products?per_page=500&sort=drop&min_price=-1')
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['per_page', 'sort', 'min_price']);
    }

    public function test_show_by_slug_or_id_and_404_without_leaking_internals(): void
    {
        $product = Product::factory()->create(['slug' => 'theory-classic']);

        $this->getJson('/api/v1/products/theory-classic')->assertOk()->assertJsonPath('data.id', $product->id);
        $this->getJson("/api/v1/products/{$product->id}")->assertOk()->assertJsonPath('data.slug', 'theory-classic');

        $product->delete();
        $this->getJson('/api/v1/products/theory-classic')
            ->assertNotFound()
            ->assertExactJson(['message' => 'Not found.', 'code' => 'not_found']);
    }

    public function test_categories_list_with_menu_counts(): void
    {
        $beef = Category::factory()->create(['slug' => 'beef', 'sort_order' => 1]);
        Category::factory()->create(['slug' => 'secret', 'is_active' => false]);
        Product::factory()->count(2)->inCategory($beef)->create();
        Product::factory()->unavailable()->inCategory($beef)->create();

        $this->getJson('/api/v1/categories')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.slug', 'beef')
            ->assertJsonPath('data.0.products_count', 2);
    }

    public function test_offers_show_only_current_public_coupons(): void
    {
        Coupon::factory()->create(['code' => 'PUBLIC10', 'is_public' => true]);
        Coupon::factory()->create(['code' => 'PRIVATE', 'is_public' => false]);
        Coupon::factory()->create(['code' => 'OLD', 'is_public' => true, 'expires_at' => now()->subDay()]);
        Coupon::factory()->create(['code' => 'USEDUP', 'is_public' => true, 'usage_limit' => 1])->forceFill(['times_used' => 1])->save();

        $this->getJson('/api/v1/offers')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.code', 'PUBLIC10')
            ->assertJsonMissingPath('data.0.times_used');
    }

    public function test_restaurant_settings_are_public(): void
    {
        $this->getJson('/api/v1/restaurant')
            ->assertOk()
            ->assertJsonPath('data.currency', 'USD')
            ->assertJsonPath('data.delivery_fee', 350)
            ->assertJsonPath('data.payment_methods', ['payhere', 'cod']);
    }
}
