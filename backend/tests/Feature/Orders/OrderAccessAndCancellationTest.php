<?php

namespace Tests\Feature\Orders;

use App\Enums\OrderStatus;
use App\Models\Coupon;
use App\Models\Order;
use App\Models\Product;
use App\Notifications\OrderStatusUpdated;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class OrderAccessAndCancellationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    public function test_customers_only_see_their_own_orders(): void
    {
        $alice = $this->customer();
        $bob = $this->customer();
        $product = Product::factory()->price(145000)->create();

        $aliceOrder = $this->placeOrder($alice, [[$product, 1]])->json('data.order_number');
        $bobOrder = $this->placeOrder($bob, [[$product, 1]])->json('data.order_number');

        $headers = $this->bearer($alice);
        $this->getJson('/api/v1/orders', $headers)
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.order_number', $aliceOrder);

        // Someone else's order looks exactly like one that doesn't exist.
        $this->getJson("/api/v1/orders/{$bobOrder}", $headers)->assertNotFound();
        $this->getJson('/api/v1/orders/BT-000000-ZZZZZZ', $headers)->assertNotFound();
        $this->postJson("/api/v1/orders/{$bobOrder}/cancel", [], $headers)->assertNotFound();
        $this->getJson("/api/v1/payments/{$bobOrder}-1", $headers)->assertNotFound();
        $this->postJson('/api/v1/payments/payhere', ['order_number' => $bobOrder], $headers)->assertNotFound();

        $this->getJson("/api/v1/orders/{$aliceOrder}", $headers)->assertOk();
        $this->getJson("/api/v1/payments/{$aliceOrder}-1", $headers)->assertOk()->assertJsonPath('data.method', 'cod');

        // Admins can see every order through the admin API; customers cannot use it.
        $this->getJson("/api/v1/admin/orders/{$bobOrder}", $headers)->assertForbidden();
        $this->getJson("/api/v1/admin/orders/{$bobOrder}", $this->bearer($this->admin()))->assertOk();
    }

    public function test_customer_cancels_a_pending_order_and_stock_and_coupon_are_released(): void
    {
        $user = $this->customer();
        $product = Product::factory()->price(145000)->stock(10)->create();
        $coupon = Coupon::factory()->percentage(10)->create(['code' => 'TENOFF']);
        $headers = $this->bearer($user);

        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 3], $headers);
        $this->postJson('/api/v1/cart/coupon', ['code' => 'TENOFF'], $headers);
        $number = $this->postJson('/api/v1/orders', ['payment_method' => 'cod', 'fulfilment_type' => 'pickup'], $headers)->json('data.order_number');

        $this->assertSame(7, $product->fresh()->stock_quantity);
        $this->assertSame(1, $coupon->fresh()->times_used);

        $this->postJson("/api/v1/orders/{$number}/cancel", ['reason' => 'Ordered by mistake'], $headers)
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled')
            ->assertJsonPath('data.payment_status', 'cancelled')
            ->assertJsonPath('data.cancellation_reason', 'Ordered by mistake')
            ->assertJsonPath('data.can_cancel', false);

        $this->assertSame(10, $product->fresh()->stock_quantity);
        $this->assertDatabaseHas('inventory_logs', ['product_id' => $product->id, 'change' => 3, 'reason' => 'order_release']);
        $this->assertSame(0, $coupon->fresh()->times_used);
        $this->assertDatabaseCount('coupon_usages', 0);
        $this->assertDatabaseHas('payments', ['reference' => "{$number}-1", 'status' => 'cancelled']);
        Notification::assertSentTo($user, OrderStatusUpdated::class);

        // Cancelling twice is refused and does not release stock again.
        $this->postJson("/api/v1/orders/{$number}/cancel", [], $headers)->assertStatus(409);
        $this->assertSame(10, $product->fresh()->stock_quantity);
    }

    public function test_confirmed_orders_cannot_be_cancelled_by_the_customer(): void
    {
        $user = $this->customer();
        $order = Order::factory()->for($user)->status(OrderStatus::Confirmed)->create();

        $this->postJson("/api/v1/orders/{$order->order_number}/cancel", [], $this->bearer($user))
            ->assertStatus(409)
            ->assertJsonPath('code', 'order_not_cancellable');
    }

    public function test_paid_orders_cannot_be_cancelled_online(): void
    {
        $user = $this->customer();
        $order = Order::factory()->for($user)->payhere()->paid()->create();

        $this->postJson("/api/v1/orders/{$order->order_number}/cancel", [], $this->bearer($user))
            ->assertStatus(409)->assertJsonPath('code', 'order_not_cancellable');
    }

    public function test_order_tracking_shows_the_timeline(): void
    {
        $user = $this->customer();
        $product = Product::factory()->price(145000)->create();
        $number = $this->placeOrder($user, [[$product, 1]])->json('data.order_number');

        $admin = $this->bearer($this->admin());
        $this->patchJson("/api/v1/admin/orders/{$number}/status", ['status' => 'confirmed'], $admin)->assertOk();
        $this->patchJson("/api/v1/admin/orders/{$number}/status", ['status' => 'preparing'], $admin)->assertOk();

        $this->getJson("/api/v1/orders/{$number}", $this->bearer($user))
            ->assertOk()
            ->assertJsonPath('data.status', 'preparing')
            ->assertJsonCount(3, 'data.timeline')
            ->assertJsonPath('data.timeline.1.status', 'confirmed')
            ->assertJsonPath('data.timeline.2.label', 'Preparing');
    }
}
