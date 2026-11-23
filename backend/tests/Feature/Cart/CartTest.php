<?php

namespace Tests\Feature\Cart;

use App\Models\Cart;
use App\Models\Coupon;
use App\Models\Product;
use App\Services\Settings\RestaurantSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class CartTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_cart_is_created_on_first_add_and_identified_by_token(): void
    {
        $product = Product::factory()->price(145000)->create();

        $response = $this->postJson('/api/v1/cart/items', ['product_slug' => $product->slug, 'quantity' => 2])
            ->assertCreated()
            ->assertJsonPath('data.items.0.quantity', 2)
            ->assertJsonPath('data.items.0.unit_price', 145000)
            ->assertJsonPath('data.subtotal', 290000);

        $token = $response->json('data.token');
        $this->assertTrue(Str::isUuid($token));
        $response->assertHeader('X-Cart-Token', $token);

        $this->getJson('/api/v1/cart', ['X-Cart-Token' => $token])->assertOk()->assertJsonPath('data.item_count', 2);
        $this->getJson('/api/v1/cart')->assertOk()->assertJsonPath('data.item_count', 0)->assertJsonPath('data.token', null);
    }

    public function test_client_supplied_prices_and_totals_are_ignored(): void
    {
        $product = Product::factory()->price(145000)->create();

        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 1, 'price' => 1, 'unit_price' => 1, 'total' => 1])
            ->assertCreated()
            ->assertJsonPath('data.items.0.unit_price', 145000)
            ->assertJsonPath('data.subtotal', 145000);
    }

    public function test_totals_include_delivery_fee_until_free_delivery_threshold(): void
    {
        $product = Product::factory()->price(145000)->create();
        $token = $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 1])->json('data.token');
        $headers = ['X-Cart-Token' => $token];

        // Default settings: LKR 350 delivery, free from LKR 5,000.
        $this->getJson('/api/v1/cart', $headers)
            ->assertJsonPath('data.delivery_fee', 35000)
            ->assertJsonPath('data.total', 180000);

        $this->getJson('/api/v1/cart?fulfilment_type=pickup', $headers)
            ->assertJsonPath('data.delivery_fee', 0)
            ->assertJsonPath('data.total', 145000);

        $item = $this->getJson('/api/v1/cart', $headers)->json('data.items.0.id');
        $this->patchJson("/api/v1/cart/items/{$item}", ['quantity' => 4], $headers)
            ->assertOk()
            ->assertJsonPath('data.subtotal', 580000)
            ->assertJsonPath('data.delivery_fee', 0)
            ->assertJsonPath('data.total', 580000);
    }

    public function test_quantities_are_validated(): void
    {
        $product = Product::factory()->create();

        foreach ([0, -1, 21, 'two', 1.5] as $bad) {
            $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => $bad])
                ->assertUnprocessable()->assertJsonValidationErrors('quantity');
        }

        $this->postJson('/api/v1/cart/items', ['quantity' => 1])->assertUnprocessable()->assertJsonValidationErrors(['product_id', 'product_slug']);
        $this->postJson('/api/v1/cart/items', ['product_id' => 999999])->assertUnprocessable()->assertJsonValidationErrors('product_id');
    }

    public function test_stock_and_availability_are_enforced(): void
    {
        $limited = Product::factory()->stock(3)->create();
        $hidden = Product::factory()->unavailable()->create();
        $madeToOrder = Product::factory()->untracked()->create();

        $token = $this->postJson('/api/v1/cart/items', ['product_id' => $limited->id, 'quantity' => 3])->assertCreated()->json('data.token');
        $headers = ['X-Cart-Token' => $token];

        $this->postJson('/api/v1/cart/items', ['product_id' => $limited->id, 'quantity' => 1], $headers)
            ->assertUnprocessable()
            ->assertJsonPath('code', 'insufficient_stock')
            ->assertJsonPath('details.available', 3);

        $this->postJson('/api/v1/cart/items', ['product_id' => $hidden->id], $headers)
            ->assertUnprocessable()->assertJsonPath('code', 'product_unavailable');

        $this->postJson('/api/v1/cart/items', ['product_id' => $madeToOrder->id, 'quantity' => 20], $headers)->assertCreated();
        $this->postJson('/api/v1/cart/items', ['product_id' => $madeToOrder->id, 'quantity' => 1], $headers)
            ->assertUnprocessable()->assertJsonPath('code', 'quantity_limit');
    }

    public function test_cart_reports_lines_that_became_unavailable(): void
    {
        $product = Product::factory()->stock(5)->create();
        $token = $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 4])->json('data.token');

        $product->update(['stock_quantity' => 2]);
        $this->getJson('/api/v1/cart', ['X-Cart-Token' => $token])
            ->assertJsonPath('data.items.0.issue', 'insufficient_stock')
            ->assertJsonPath('data.can_checkout', false);

        $product->update(['is_available' => false]);
        $this->getJson('/api/v1/cart', ['X-Cart-Token' => $token])
            ->assertJsonPath('data.items.0.issue', 'product_unavailable')
            ->assertJsonPath('data.subtotal', 0)
            ->assertJsonPath('data.issues.0.code', 'product_unavailable');
    }

    public function test_update_to_zero_removes_and_lines_from_other_carts_are_not_reachable(): void
    {
        $product = Product::factory()->create();
        $mine = $this->postJson('/api/v1/cart/items', ['product_id' => $product->id])->json('data');
        $theirs = $this->postJson('/api/v1/cart/items', ['product_id' => $product->id])->json('data');

        $headers = ['X-Cart-Token' => $mine['token']];
        $this->patchJson("/api/v1/cart/items/{$theirs['items'][0]['id']}", ['quantity' => 5], $headers)->assertNotFound();
        $this->deleteJson("/api/v1/cart/items/{$theirs['items'][0]['id']}", [], $headers)->assertNotFound();

        $this->patchJson("/api/v1/cart/items/{$mine['items'][0]['id']}", ['quantity' => -2], $headers)->assertUnprocessable();
        $this->patchJson("/api/v1/cart/items/{$mine['items'][0]['id']}", ['quantity' => 0], $headers)
            ->assertOk()->assertJsonCount(0, 'data.items');
    }

    public function test_remove_and_clear(): void
    {
        [$a, $b] = Product::factory()->count(2)->create();
        $token = $this->postJson('/api/v1/cart/items', ['product_id' => $a->id])->json('data.token');
        $headers = ['X-Cart-Token' => $token];
        $line = $this->postJson('/api/v1/cart/items', ['product_id' => $b->id], $headers)->json('data.items.1.id');

        $this->deleteJson("/api/v1/cart/items/{$line}", [], $headers)->assertOk()->assertJsonCount(1, 'data.items');
        $this->deleteJson('/api/v1/cart', [], $headers)->assertOk()->assertJsonCount(0, 'data.items')->assertJsonPath('data.total', 0);
    }

    public function test_signed_in_customer_has_one_cart_and_guest_tokens_cannot_open_it(): void
    {
        $user = $this->customer();
        $product = Product::factory()->create();

        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id], $this->bearer($user))
            ->assertCreated()->assertJsonPath('data.token', null);

        $userCart = Cart::query()->where('user_id', $user->id)->firstOrFail();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/cart', ['X-Cart-Token' => $userCart->token])->assertOk()->assertJsonPath('data.item_count', 0);
    }

    public function test_invalid_bearer_token_is_rejected_rather_than_treated_as_guest(): void
    {
        $this->getJson('/api/v1/cart', ['Authorization' => 'Bearer not-a-real-token'])->assertUnauthorized();
    }

    public function test_guest_cart_merges_into_customer_cart_after_login(): void
    {
        $user = $this->customer();
        [$a, $b] = Product::factory()->count(2)->stock(10)->create();
        $gone = Product::factory()->create();

        $guestToken = $this->postJson('/api/v1/cart/items', ['product_id' => $a->id, 'quantity' => 6])->json('data.token');
        $this->postJson('/api/v1/cart/items', ['product_id' => $b->id, 'quantity' => 1], ['X-Cart-Token' => $guestToken]);
        $this->postJson('/api/v1/cart/items', ['product_id' => $gone->id, 'quantity' => 1], ['X-Cart-Token' => $guestToken]);
        $gone->update(['is_available' => false]);

        $headers = $this->bearer($user);
        $this->postJson('/api/v1/cart/items', ['product_id' => $a->id, 'quantity' => 7], $headers);

        $response = $this->postJson('/api/v1/cart/merge', ['cart_token' => $guestToken], $headers)->assertOk();

        $quantities = collect($response->json('data.items'))->mapWithKeys(fn ($i) => [$i['product']['id'] => $i['quantity']]);
        $this->assertSame([$a->id => 10, $b->id => 1], $quantities->all()); // 7 + 6 capped at stock 10; unavailable dropped
        $this->assertDatabaseMissing('carts', ['token' => $guestToken]);
    }

    public function test_coupon_is_validated_and_discount_applied(): void
    {
        Coupon::factory()->percentage(10)->create(['code' => 'WELCOME10', 'min_order_amount' => 200000]);
        Coupon::factory()->fixed(30000)->create(['code' => 'OLD', 'expires_at' => now()->subDay()]);
        $product = Product::factory()->price(145000)->create();

        $token = $this->postJson('/api/v1/cart/items', ['product_id' => $product->id])->json('data.token');
        $headers = ['X-Cart-Token' => $token];

        $this->postJson('/api/v1/cart/coupon', ['code' => 'nope'], $headers)->assertUnprocessable()->assertJsonPath('code', 'coupon_not_found');
        $this->postJson('/api/v1/cart/coupon', ['code' => 'old'], $headers)->assertUnprocessable()->assertJsonPath('code', 'coupon_expired');
        $this->postJson('/api/v1/cart/coupon', ['code' => 'welcome10'], $headers)
            ->assertUnprocessable()->assertJsonPath('code', 'coupon_minimum_not_met')->assertJsonPath('details.minimum_order_amount', 200000);

        $item = $this->getJson('/api/v1/cart', $headers)->json('data.items.0.id');
        $this->patchJson("/api/v1/cart/items/{$item}", ['quantity' => 2], $headers);

        $this->postJson('/api/v1/cart/coupon', ['code' => ' welcome10 '], $headers)
            ->assertOk()
            ->assertJsonPath('data.coupon.code', 'WELCOME10')
            ->assertJsonPath('data.coupon.is_valid', true)
            ->assertJsonPath('data.subtotal', 290000)
            ->assertJsonPath('data.discount_total', 29000)
            ->assertJsonPath('data.delivery_fee', 35000)
            ->assertJsonPath('data.total', 296000);

        // Dropping below the coupon minimum keeps the code but stops the discount.
        $this->patchJson("/api/v1/cart/items/{$item}", ['quantity' => 1], $headers)
            ->assertJsonPath('data.coupon.is_valid', false)
            ->assertJsonPath('data.coupon.error.code', 'coupon_minimum_not_met')
            ->assertJsonPath('data.discount_total', 0);

        $this->deleteJson('/api/v1/cart/coupon', [], $headers)->assertOk()->assertJsonPath('data.coupon', null);
    }

    public function test_cart_reflects_admin_settings(): void
    {
        app(RestaurantSettings::class)->update(['delivery_fee' => 50000, 'free_delivery_threshold' => null, 'minimum_order_amount' => 300000]);
        $product = Product::factory()->price(145000)->create();

        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 4])
            ->assertJsonPath('data.delivery_fee', 50000)
            ->assertJsonPath('data.can_checkout', true);

        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id])
            ->assertJsonPath('data.can_checkout', false)
            ->assertJsonPath('data.issues.0.code', 'below_minimum_order');
    }
}
