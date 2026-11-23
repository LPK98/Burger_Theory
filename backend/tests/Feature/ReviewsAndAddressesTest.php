<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\Address;
use App\Models\Order;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReviewsAndAddressesTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_customers_with_a_delivered_order_can_review_once(): void
    {
        $product = Product::factory()->price(145000)->create();
        $buyer = $this->customer(['name' => 'Kasun Silva']);
        Order::factory()->for($buyer)->status(OrderStatus::Delivered)->withItem($product)->create();

        $this->postJson("/api/v1/products/{$product->slug}/reviews", ['rating' => 5], $this->bearer($this->customer()))
            ->assertForbidden()->assertJsonPath('code', 'review_requires_purchase');

        $headers = $this->bearer($buyer);
        $this->postJson("/api/v1/products/{$product->slug}/reviews", ['rating' => 6], $headers)->assertUnprocessable();
        $this->postJson("/api/v1/products/{$product->slug}/reviews", ['rating' => 5, 'title' => 'Best smash burger', 'body' => 'Crispy edges.'], $headers)
            ->assertCreated()
            ->assertJsonPath('data.author', 'Kasun S.')
            ->assertJsonPath('data.is_verified_purchase', true);
        $this->postJson("/api/v1/products/{$product->slug}/reviews", ['rating' => 4], $headers)->assertStatus(409);

        $this->app['auth']->forgetGuards();
        $this->getJson("/api/v1/products/{$product->slug}")->assertJsonPath('data.rating', ['average' => 5, 'count' => 1]);
        $this->getJson("/api/v1/products/{$product->slug}/reviews")->assertJsonCount(1, 'data')->assertJsonMissingPath('data.0.user_id');
    }

    public function test_admin_can_hide_a_review(): void
    {
        $product = Product::factory()->create();
        $buyer = $this->customer();
        Order::factory()->for($buyer)->status(OrderStatus::Delivered)->withItem($product)->create();
        $id = $this->postJson("/api/v1/products/{$product->id}/reviews", ['rating' => 1, 'body' => 'spam'], $this->bearer($buyer))->json('data.id');

        $this->patchJson("/api/v1/admin/reviews/{$id}", ['is_published' => false], $this->bearer($this->admin()))->assertOk();

        $this->app['auth']->forgetGuards();
        $this->getJson("/api/v1/products/{$product->id}/reviews")->assertJsonCount(0, 'data');
    }

    public function test_addresses_are_private_and_one_is_default(): void
    {
        $user = $this->customer();
        $foreign = Address::factory()->create();
        $headers = $this->bearer($user);
        $payload = ['recipient_name' => 'Me', 'phone' => '0771234567', 'line1' => '1 Main St', 'city' => 'Colombo'];

        $first = $this->postJson('/api/v1/addresses', $payload, $headers)->assertCreated()->assertJsonPath('data.is_default', true)->json('data.id');
        $second = $this->postJson('/api/v1/addresses', $payload + ['is_default' => true], $headers)->assertCreated()->json('data.id');

        $this->assertFalse(Address::query()->find($first)->is_default);
        $this->getJson('/api/v1/addresses', $headers)->assertJsonCount(2, 'data')->assertJsonPath('data.0.id', $second);

        $this->getJson("/api/v1/addresses/{$foreign->id}", $headers)->assertNotFound();
        $this->patchJson("/api/v1/addresses/{$foreign->id}", ['city' => 'Hacked'], $headers)->assertNotFound();
        $this->deleteJson("/api/v1/addresses/{$foreign->id}", [], $headers)->assertNotFound();

        $this->postJson('/api/v1/addresses', ['phone' => 'call me'], $headers)->assertUnprocessable()->assertJsonValidationErrors(['recipient_name', 'phone', 'line1', 'city']);

        $this->deleteJson("/api/v1/addresses/{$second}", [], $headers)->assertNoContent();
        $this->assertTrue(Address::query()->find($first)->is_default);
    }

    public function test_admin_settings_update(): void
    {
        $headers = $this->bearer($this->admin());

        $this->patchJson('/api/v1/admin/settings', ['delivery_fee' => 40000, 'free_delivery_threshold' => null, 'unknown_key' => 1], $headers)
            ->assertOk()
            ->assertJsonPath('data.delivery_fee', 40000)
            ->assertJsonPath('data.free_delivery_threshold', null)
            ->assertJsonMissingPath('data.unknown_key');

        $this->patchJson('/api/v1/admin/settings', ['delivery_fee' => -1], $headers)->assertUnprocessable();

        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/restaurant')->assertJsonPath('data.delivery_fee', 40000);
    }

    public function test_admin_manages_coupons(): void
    {
        $headers = $this->bearer($this->admin());

        $id = $this->postJson('/api/v1/admin/coupons', ['code' => 'summer-25', 'discount_type' => 'percentage', 'percentage' => 25, 'max_discount_amount' => 100000], $headers)
            ->assertCreated()->assertJsonPath('data.code', 'SUMMER-25')->json('data.id');

        $this->postJson('/api/v1/admin/coupons', ['code' => 'SUMMER-25', 'discount_type' => 'fixed'], $headers)
            ->assertUnprocessable()->assertJsonValidationErrors(['code', 'amount']);
        $this->postJson('/api/v1/admin/coupons', ['code' => 'BAD', 'discount_type' => 'percentage', 'percentage' => 150], $headers)
            ->assertUnprocessable()->assertJsonValidationErrors('percentage');

        $this->patchJson("/api/v1/admin/coupons/{$id}", ['discount_type' => 'fixed', 'amount' => 30000], $headers)
            ->assertOk()->assertJsonPath('data.amount', 30000)->assertJsonPath('data.percentage', null);
    }
}
