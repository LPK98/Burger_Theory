<?php

namespace Tests\Feature\Orders;

use App\Models\Address;
use App\Models\Coupon;
use App\Models\Order;
use App\Models\Product;
use App\Notifications\NewOrderReceived;
use App\Notifications\OrderPlaced;
use App\Services\Settings\RestaurantSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class PlaceOrderTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    public function test_cash_on_delivery_order_is_priced_from_the_database_and_snapshotted(): void
    {
        $admin = $this->admin();
        $user = $this->customer(['name' => 'Nimali Perera']);
        $classic = Product::factory()->price(1450)->stock(10)->create(['name' => 'The Theory Classic']);
        $stack = Product::factory()->price(2100)->stock(5)->create(['name' => 'The Ultimate Stack']);

        $response = $this->placeOrder($user, [[$classic, 2], [$stack, 1]], 'cod', 'delivery', [
            'address' => [
                'recipient_name' => 'Nimali Perera',
                'phone' => '0771234567',
                'line1' => '12 Galle Road',
                'city' => 'Colombo 03',
            ],
            'notes' => 'Ring the bell',
            // Attempted manipulation: none of this may be used.
            'subtotal' => 1, 'total' => 1, 'items' => [['product_id' => $classic->id, 'unit_price' => 1]],
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.payment_method', 'cod')
            ->assertJsonPath('data.payment_status', 'pending')
            ->assertJsonPath('data.subtotal', 5000)
            ->assertJsonPath('data.delivery_fee', 0) // $50 reaches the free-delivery threshold
            ->assertJsonPath('data.total', 5000)
            ->assertJsonPath('data.items.0.name', 'The Theory Classic')
            ->assertJsonPath('data.items.0.unit_price', 1450)
            ->assertJsonPath('data.delivery_address.line1', '12 Galle Road')
            ->assertJsonPath('data.payment.status', 'pending')
            ->assertJsonPath('data.timeline.0.status', 'pending')
            ->assertJsonPath('meta.created', true)
            ->assertJsonPath('meta.next_action', null);

        $this->assertMatchesRegularExpression('/^BT-\d{6}-[2-9A-HJ-NP-Z]{6}$/', $response->json('data.order_number'));

        // Stock taken and logged, cart emptied.
        $this->assertSame(8, $classic->fresh()->stock_quantity);
        $this->assertSame(4, $stack->fresh()->stock_quantity);
        $this->assertDatabaseHas('inventory_logs', ['product_id' => $classic->id, 'change' => -2, 'reason' => 'sale', 'quantity_after' => 8]);
        $this->getJson('/api/v1/cart', $this->bearer($user))->assertJsonPath('data.item_count', 0);

        // Later price and profile changes do not touch the order.
        $classic->update(['price' => 999900, 'name' => 'Renamed']);
        $this->getJson('/api/v1/orders/'.$response->json('data.order_number'), $this->bearer($user))
            ->assertJsonPath('data.items.0.unit_price', 1450)
            ->assertJsonPath('data.items.0.name', 'The Theory Classic');

        Notification::assertSentTo($user, OrderPlaced::class);
        Notification::assertSentTo($admin, NewOrderReceived::class);
    }

    public function test_delivery_fee_is_charged_below_the_threshold(): void
    {
        $user = $this->customer();
        $address = Address::factory()->for($user)->create();
        $product = Product::factory()->price(1450)->create();

        $this->placeOrder($user, [[$product, 1]], 'cod', 'delivery', ['address_id' => $address->id])
            ->assertCreated()
            ->assertJsonPath('data.delivery_fee', 350)
            ->assertJsonPath('data.total', 1800)
            ->assertJsonPath('data.delivery_address.city', $address->city)
            // The delivery address phone is the contact number when no contact_phone is given.
            ->assertJsonPath('data.customer.phone', $address->phone);
    }

    public function test_delivery_requires_an_address_and_rejects_someone_elses(): void
    {
        $user = $this->customer();
        $foreign = Address::factory()->create();
        $product = Product::factory()->price(145000)->create();

        $this->placeOrder($user, [[$product, 1]], 'cod', 'delivery')
            ->assertUnprocessable()->assertJsonValidationErrors('address');

        $this->postJson('/api/v1/orders', ['payment_method' => 'cod', 'fulfilment_type' => 'delivery', 'address_id' => $foreign->id], $this->bearer($user))
            ->assertUnprocessable()->assertJsonValidationErrors('address_id');

        $this->assertSame(0, Order::query()->count());
    }

    public function test_empty_cart_cannot_be_ordered(): void
    {
        $this->postJson('/api/v1/orders', ['payment_method' => 'cod', 'fulfilment_type' => 'pickup'], $this->bearer($this->customer()))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'cart_empty');
    }

    public function test_stock_is_rechecked_at_checkout_and_nothing_is_written_on_failure(): void
    {
        $user = $this->customer();
        $product = Product::factory()->price(145000)->stock(5)->create();
        $other = Product::factory()->price(145000)->stock(5)->create();
        $headers = $this->bearer($user);
        $this->postJson('/api/v1/cart/items', ['product_id' => $other->id, 'quantity' => 1], $headers);
        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 4], $headers);

        $product->update(['stock_quantity' => 3]); // someone else bought some meanwhile

        $this->postJson('/api/v1/orders', ['payment_method' => 'cod', 'fulfilment_type' => 'pickup'], $headers)
            ->assertUnprocessable()
            ->assertJsonPath('code', 'insufficient_stock')
            ->assertJsonPath('details.available', 3);

        $this->assertSame(0, Order::query()->count());
        $this->assertSame(5, $other->fresh()->stock_quantity);
        $this->assertDatabaseCount('inventory_logs', 0);
    }

    public function test_unavailable_products_block_checkout(): void
    {
        $user = $this->customer();
        $product = Product::factory()->price(145000)->create();
        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id], $this->bearer($user));
        $product->update(['is_available' => false]);

        $this->postJson('/api/v1/orders', ['payment_method' => 'cod', 'fulfilment_type' => 'pickup'], $this->bearer($user))
            ->assertUnprocessable()->assertJsonPath('code', 'product_unavailable');
    }

    public function test_minimum_order_amount_is_enforced(): void
    {
        $product = Product::factory()->price(900)->create();

        $this->placeOrder($this->customer(), [[$product, 1]])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'below_minimum_order')
            ->assertJsonPath('details.minimum_order_amount', 1000);
    }

    public function test_idempotency_key_prevents_duplicate_orders(): void
    {
        $user = $this->customer();
        $product = Product::factory()->price(145000)->stock(10)->create();
        $key = ['Idempotency-Key' => '6f1c2f7e-5b0a-4f7a-9a65-2d0c8d1b7a11'];

        $first = $this->placeOrder($user, [[$product, 2]], headers: $key)->assertCreated();

        $this->postJson('/api/v1/orders', ['payment_method' => 'cod', 'fulfilment_type' => 'pickup'], $this->bearer($user) + $key)
            ->assertOk()
            ->assertJsonPath('data.order_number', $first->json('data.order_number'))
            ->assertJsonPath('meta.created', false);

        $this->assertSame(1, Order::query()->count());
        $this->assertSame(8, $product->fresh()->stock_quantity);
    }

    public function test_coupon_is_applied_recorded_and_limited_per_customer(): void
    {
        $user = $this->customer();
        $coupon = Coupon::factory()->percentage(10)->create(['code' => 'WELCOME10', 'usage_limit_per_user' => 1]);
        $product = Product::factory()->price(145000)->stock(20)->create();
        $headers = $this->bearer($user);

        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 2], $headers);
        $this->postJson('/api/v1/cart/coupon', ['code' => 'WELCOME10'], $headers)->assertOk();
        $this->postJson('/api/v1/orders', ['payment_method' => 'cod', 'fulfilment_type' => 'pickup'], $headers)
            ->assertCreated()
            ->assertJsonPath('data.subtotal', 290000)
            ->assertJsonPath('data.discount_total', 29000)
            ->assertJsonPath('data.total', 261000)
            ->assertJsonPath('data.coupon_code', 'WELCOME10');

        $this->assertSame(1, $coupon->fresh()->times_used);
        $this->assertDatabaseHas('coupon_usages', ['coupon_id' => $coupon->id, 'user_id' => $user->id, 'discount_amount' => '290.00']);

        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 2], $headers);
        $this->postJson('/api/v1/cart/coupon', ['code' => 'WELCOME10'], $headers)
            ->assertUnprocessable()->assertJsonPath('code', 'coupon_already_used');
    }

    public function test_coupon_exhausted_between_cart_and_checkout_is_rejected(): void
    {
        $user = $this->customer();
        $coupon = Coupon::factory()->fixed(20000)->create(['code' => 'ONCE', 'usage_limit' => 1]);
        $product = Product::factory()->price(145000)->create();
        $headers = $this->bearer($user);

        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id], $headers);
        $this->postJson('/api/v1/cart/coupon', ['code' => 'ONCE'], $headers)->assertOk();
        $coupon->forceFill(['times_used' => 1])->save();

        $this->postJson('/api/v1/orders', ['payment_method' => 'cod', 'fulfilment_type' => 'pickup'], $headers)
            ->assertUnprocessable()->assertJsonPath('code', 'coupon_exhausted');
    }

    public function test_ordering_switches_are_respected(): void
    {
        $settings = app(RestaurantSettings::class);
        $product = Product::factory()->price(145000)->create();
        $user = $this->customer();

        $settings->update(['accepting_orders' => false]);
        $this->placeOrder($user, [[$product, 1]])->assertStatus(503)->assertJsonPath('code', 'not_accepting_orders');

        $settings->update(['accepting_orders' => true, 'cod_enabled' => false]);
        $this->postJson('/api/v1/orders', ['payment_method' => 'cod', 'fulfilment_type' => 'pickup'], $this->bearer($user))
            ->assertUnprocessable()->assertJsonPath('code', 'payment_method_unavailable');

        $settings->update(['cod_enabled' => true, 'pickup_enabled' => false]);
        $this->postJson('/api/v1/orders', ['payment_method' => 'cod', 'fulfilment_type' => 'pickup'], $this->bearer($user))
            ->assertUnprocessable()->assertJsonPath('code', 'fulfilment_unavailable');
    }

    public function test_payhere_orders_need_configured_credentials_and_await_payment(): void
    {
        $product = Product::factory()->price(145000)->create();
        $user = $this->customer();

        config(['services.payhere.merchant_secret' => '']);
        $this->placeOrder($user, [[$product, 1]], 'payhere')
            ->assertStatus(503)->assertJsonPath('code', 'payment_gateway_not_configured');

        config(['services.payhere.merchant_secret' => 'test-merchant-secret']);
        $this->postJson('/api/v1/orders', ['payment_method' => 'payhere', 'fulfilment_type' => 'pickup'], $this->bearer($user))
            ->assertCreated()
            ->assertJsonPath('data.payment_status', 'pending')
            ->assertJsonPath('data.can_pay_online', true)
            ->assertJsonPath('meta.next_action', 'payhere_checkout');
    }

    public function test_save_address_adds_it_to_the_address_book(): void
    {
        $user = $this->customer();
        $product = Product::factory()->price(145000)->create();

        $this->placeOrder($user, [[$product, 1]], 'cod', 'delivery', [
            'address' => ['recipient_name' => 'Me', 'phone' => '0771234567', 'line1' => '1 Main St', 'city' => 'Kandy'],
            'save_address' => true,
        ])->assertCreated();

        $this->assertDatabaseHas('addresses', ['user_id' => $user->id, 'city' => 'Kandy', 'is_default' => true]);
    }
}
