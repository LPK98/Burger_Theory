<?php

namespace Tests\Feature\Admin;

use App\Models\Category;
use App\Models\Product;
use App\Services\Product\Images\ImageStorage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\Fakes\FakeImageStorage;
use Tests\TestCase;

class AdminProductTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_admins_manage_products(): void
    {
        $product = Product::factory()->create();

        $this->postJson('/api/v1/admin/products', [])->assertUnauthorized();
        $customer = $this->bearer($this->customer());
        $this->postJson('/api/v1/admin/products', ['name' => 'X'], $customer)->assertForbidden();
        $this->patchJson("/api/v1/admin/products/{$product->id}", ['price' => 1], $customer)->assertForbidden();
        $this->deleteJson("/api/v1/admin/products/{$product->id}", [], $customer)->assertForbidden();
        $this->assertNotSame(1, $product->fresh()->price);
    }

    public function test_admin_creates_a_product_with_categories_and_opening_stock(): void
    {
        $admin = $this->admin();
        $beef = Category::factory()->create(['slug' => 'beef']);
        $spicy = Category::factory()->create(['slug' => 'spicy']);

        $response = $this->postJson('/api/v1/admin/products', [
            'name' => 'Fire House Burger',
            'description' => 'Pepper jack and jalapeños',
            'price' => 159000,
            'badge' => 'Hot',
            'stock_quantity' => 40,
            'category_ids' => [$beef->id, $spicy->id],
        ], $this->bearer($admin));

        $response->assertCreated()
            ->assertJsonPath('data.slug', 'fire-house-burger')
            ->assertJsonPath('data.price', 159000)
            ->assertJsonPath('data.stock_quantity', 40)
            ->assertJsonCount(2, 'data.categories');

        $this->assertDatabaseHas('products', ['slug' => 'fire-house-burger', 'price' => '1590.00']);
        $this->assertDatabaseHas('inventory_logs', ['product_id' => $response->json('data.id'), 'change' => 40, 'reason' => 'restock', 'user_id' => $admin->id]);

        // Same name again gets a distinct slug.
        $this->postJson('/api/v1/admin/products', ['name' => 'Fire House Burger', 'price' => 1000, 'category_ids' => [$beef->id]], $this->bearer($admin))
            ->assertCreated()->assertJsonPath('data.slug', 'fire-house-burger-2');
    }

    public function test_product_validation(): void
    {
        $headers = $this->bearer($this->admin());

        $this->postJson('/api/v1/admin/products', [
            'name' => '',
            'price' => -5,
            'compare_at_price' => 100,
            'slug' => '12345',
            'category_ids' => [999],
        ], $headers)->assertUnprocessable()->assertJsonValidationErrors(['name', 'price', 'slug', 'category_ids.0']);

        $this->postJson('/api/v1/admin/products', ['name' => 'Cheap', 'price' => 5000, 'compare_at_price' => 4000, 'category_ids' => [Category::factory()->create()->id]], $headers)
            ->assertUnprocessable()->assertJsonValidationErrors('compare_at_price');
    }

    public function test_admin_updates_price_and_availability_but_not_stock_directly(): void
    {
        $product = Product::factory()->price(145000)->stock(10)->create();
        $headers = $this->bearer($this->admin());

        $this->patchJson("/api/v1/admin/products/{$product->id}", ['price' => 155000, 'is_available' => false], $headers)
            ->assertOk()
            ->assertJsonPath('data.price', 155000)
            ->assertJsonPath('data.is_available', false);

        $this->getJson("/api/v1/products/{$product->slug}")->assertOk()->assertJsonPath('data.is_available', false);
        $this->assertSame([], $this->getJson('/api/v1/products')->json('data'));

        $this->patchJson("/api/v1/admin/products/{$product->id}", ['stock_quantity' => 999], $headers)
            ->assertUnprocessable()->assertJsonValidationErrors('stock_quantity');
        $this->assertSame(10, $product->fresh()->stock_quantity);
    }

    public function test_stock_adjustments_are_logged_and_cannot_go_negative(): void
    {
        $product = Product::factory()->stock(10)->create();
        $headers = $this->bearer($this->admin());

        $this->postJson("/api/v1/admin/products/{$product->id}/stock", ['change' => 15, 'reason' => 'restock', 'note' => 'Delivery'], $headers)
            ->assertCreated()
            ->assertJsonPath('data.product.stock_quantity', 25)
            ->assertJsonPath('data.log.quantity_before', 10)
            ->assertJsonPath('data.log.quantity_after', 25);

        $this->postJson("/api/v1/admin/products/{$product->id}/stock", ['set_to' => 7, 'reason' => 'adjustment'], $headers)
            ->assertCreated()->assertJsonPath('data.log.change', -18);

        $this->postJson("/api/v1/admin/products/{$product->id}/stock", ['change' => -8, 'reason' => 'adjustment'], $headers)
            ->assertUnprocessable()->assertJsonValidationErrors('change');

        $this->postJson("/api/v1/admin/products/{$product->id}/stock", ['change' => 1, 'reason' => 'sale'], $headers)
            ->assertUnprocessable()->assertJsonValidationErrors('reason');

        $this->assertSame(7, $product->fresh()->stock_quantity);
        $this->getJson("/api/v1/admin/products/{$product->id}/stock", $headers)->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_deleted_products_leave_the_menu_and_can_be_restored(): void
    {
        $product = Product::factory()->create();
        $headers = $this->bearer($this->admin());

        $this->deleteJson("/api/v1/admin/products/{$product->id}", [], $headers)->assertNoContent();
        $this->assertSoftDeleted($product);
        $this->getJson("/api/v1/products/{$product->slug}")->assertNotFound();

        $this->getJson('/api/v1/admin/products?with_trashed=1', $headers)->assertJsonPath('data.0.deleted_at', fn ($v) => $v !== null);
        $this->postJson("/api/v1/admin/products/{$product->id}/restore", [], $headers)->assertOk()->assertJsonPath('data.deleted_at', null);
        $this->getJson("/api/v1/products/{$product->slug}")->assertOk();
    }

    public function test_image_upload_goes_to_image_storage(): void
    {
        $storage = new FakeImageStorage;
        $this->app->instance(ImageStorage::class, $storage);
        $product = Product::factory()->create();
        $headers = $this->bearer($this->admin());

        $first = $this->post("/api/v1/admin/products/{$product->id}/images", [
            'image' => UploadedFile::fake()->image('classic.jpg', 1000, 1000),
            'alt_text' => 'The Theory Classic',
        ], $headers)->assertCreated();

        $first->assertJsonPath('data.is_primary', true)->assertJsonPath('data.alt', 'The Theory Classic');
        $this->assertStringStartsWith('https://res.cloudinary.com/', $first->json('data.url'));

        $second = $this->post("/api/v1/admin/products/{$product->id}/images", [
            'image' => UploadedFile::fake()->image('side.png', 800, 800),
            'is_primary' => '1',
        ], $headers)->assertCreated()->assertJsonPath('data.is_primary', true);

        $this->assertFalse($product->images()->whereKey($first->json('data.id'))->value('is_primary'));

        $this->deleteJson("/api/v1/admin/products/{$product->id}/images/{$second->json('data.id')}", [], $headers)->assertNoContent();
        $this->assertCount(1, $storage->deleted);
        $this->assertTrue($product->images()->whereKey($first->json('data.id'))->value('is_primary'));

        $this->post("/api/v1/admin/products/{$product->id}/images", ['image' => UploadedFile::fake()->create('doc.pdf', 10, 'application/pdf')], $headers + ['Accept' => 'application/json'])
            ->assertUnprocessable()->assertJsonValidationErrors('image');

        // An image of another product cannot be addressed through this product.
        $other = Product::factory()->create();
        $this->deleteJson("/api/v1/admin/products/{$other->id}/images/{$first->json('data.id')}", [], $headers)->assertNotFound();
    }

    public function test_image_upload_without_cloudinary_credentials_is_reported(): void
    {
        $product = Product::factory()->create();

        $this->post("/api/v1/admin/products/{$product->id}/images", [
            'image' => UploadedFile::fake()->image('classic.jpg', 600, 600),
        ], $this->bearer($this->admin()))->assertStatus(503)->assertJsonPath('code', 'image_storage_not_configured');
    }

    public function test_admin_manages_categories(): void
    {
        $headers = $this->bearer($this->admin());

        $id = $this->postJson('/api/v1/admin/categories', ['name' => 'Sides'], $headers)
            ->assertCreated()->assertJsonPath('data.slug', 'sides')->json('data.id');

        $this->patchJson("/api/v1/admin/categories/{$id}", ['is_active' => false], $headers)->assertOk()->assertJsonPath('data.is_active', false);
        $this->assertSame([], $this->getJson('/api/v1/categories')->json('data'));
        $this->deleteJson("/api/v1/admin/categories/{$id}", [], $headers)->assertNoContent();
    }
}
