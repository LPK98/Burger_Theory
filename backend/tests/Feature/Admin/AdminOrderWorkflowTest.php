<?php

namespace Tests\Feature\Admin;

use App\Enums\OrderStatus;
use App\Models\Order;
use App\Models\Product;
use App\Notifications\OrderStatusUpdated;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class AdminOrderWorkflowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    public function test_delivery_order_moves_through_every_status(): void
    {
        $user = $this->customer();
        $product = Product::factory()->price(145000)->create();
        $number = $this->placeOrder($user, [[$product, 1]], 'cod', 'delivery', [
            'address' => ['recipient_name' => 'A', 'phone' => '0771234567', 'line1' => '1 Main St', 'city' => 'Colombo'],
        ])->json('data.order_number');
        $headers = $this->bearer($this->admin());

        foreach (['confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered'] as $status) {
            $this->patchJson("/api/v1/admin/orders/{$number}/status", ['status' => $status], $headers)
                ->assertOk()->assertJsonPath('data.status', $status);
        }

        $order = Order::query()->where('order_number', $number)->firstOrFail();
        $this->assertNotNull($order->delivered_at);
        $this->assertSame(6, $order->statusHistory()->count());
        Notification::assertSentToTimes($user, OrderStatusUpdated::class, 5);

        // The admin view of the timeline says who made each change.
        $this->getJson("/api/v1/admin/orders/{$number}", $this->bearer($this->admin()))
            ->assertJsonPath('data.timeline.0.actor', 'customer')
            ->assertJsonPath('data.timeline.1.actor', 'admin')
            ->assertJsonPath('data.timeline.1.from', 'pending')
            ->assertJsonPath('data.timeline.1.changed_by', fn ($name) => is_string($name) && $name !== '');
    }

    public function test_invalid_transitions_are_refused_with_the_allowed_options(): void
    {
        $order = Order::factory()->create();
        $headers = $this->bearer($this->admin());

        $this->patchJson("/api/v1/admin/orders/{$order->order_number}/status", ['status' => 'delivered'], $headers)
            ->assertStatus(409)
            ->assertJsonPath('code', 'invalid_status_transition')
            ->assertJsonPath('details.allowed', ['confirmed', 'rejected', 'cancelled']);

        $this->patchJson("/api/v1/admin/orders/{$order->order_number}/status", ['status' => 'pending'], $headers)->assertUnprocessable();
        $this->patchJson("/api/v1/admin/orders/{$order->order_number}/status", ['status' => 'teleported'], $headers)->assertUnprocessable();

        // Pickup orders have no "out for delivery".
        $ready = Order::factory()->status(OrderStatus::Ready)->create();
        $this->patchJson("/api/v1/admin/orders/{$ready->order_number}/status", ['status' => 'out_for_delivery'], $headers)->assertStatus(409);
    }

    public function test_unpaid_payhere_orders_cannot_be_confirmed(): void
    {
        $order = Order::factory()->payhere()->create();
        $headers = $this->bearer($this->admin());

        $this->patchJson("/api/v1/admin/orders/{$order->order_number}/status", ['status' => 'confirmed'], $headers)
            ->assertStatus(409)->assertJsonPath('code', 'payment_required');

        $paid = Order::factory()->payhere()->paid()->create();
        $this->patchJson("/api/v1/admin/orders/{$paid->order_number}/status", ['status' => 'confirmed'], $headers)->assertOk();
    }

    public function test_rejecting_requires_a_reason_and_releases_stock(): void
    {
        $user = $this->customer();
        $product = Product::factory()->price(145000)->stock(4)->create();
        $number = $this->placeOrder($user, [[$product, 2]])->json('data.order_number');
        $headers = $this->bearer($this->admin());

        $this->patchJson("/api/v1/admin/orders/{$number}/status", ['status' => 'rejected'], $headers)
            ->assertUnprocessable()->assertJsonValidationErrors('note');

        $this->patchJson("/api/v1/admin/orders/{$number}/status", ['status' => 'rejected', 'note' => 'Out of buns'], $headers)
            ->assertOk()
            ->assertJsonPath('data.status', 'rejected')
            ->assertJsonPath('data.cancelled_by', 'admin')
            ->assertJsonPath('data.cancellation_reason', 'Out of buns');

        $this->assertSame(4, $product->fresh()->stock_quantity);
    }

    public function test_cancelling_a_paid_order_flags_it_for_refund(): void
    {
        $order = Order::factory()->payhere()->paid()->status(OrderStatus::Confirmed)->create();

        $this->patchJson("/api/v1/admin/orders/{$order->order_number}/status", ['status' => 'cancelled', 'note' => 'Customer called'], $this->bearer($this->admin()))
            ->assertOk()
            ->assertJsonPath('data.payment_status', 'refund_required')
            ->assertJsonPath('data.payments.0.status', 'refund_required');
    }

    public function test_orders_can_be_filtered_by_status_date_payment_and_search(): void
    {
        $tz = 'Asia/Colombo';
        // 23:30 in Colombo on 1 Nov is still 1 Nov locally (18:00 UTC).
        $late = Order::factory()->create(['created_at' => CarbonImmutable::parse('2026-11-01 23:30', $tz)->utc(), 'customer_name' => 'Late Night']);
        $next = Order::factory()->status(OrderStatus::Delivered)->create(['created_at' => CarbonImmutable::parse('2026-11-02 00:30', $tz)->utc()]);
        $cod = Order::factory()->payhere()->create(['created_at' => CarbonImmutable::parse('2026-11-05 12:00', $tz)->utc()]);
        $headers = $this->bearer($this->admin());

        $numbers = fn (string $query) => collect($this->getJson("/api/v1/admin/orders?{$query}", $headers)->assertOk()->json('data'))->pluck('order_number')->all();

        $this->assertSame([$late->order_number], $numbers('date_from=2026-11-01&date_to=2026-11-01'));
        $this->assertSame([$next->order_number], $numbers('status=delivered'));
        $this->assertEqualsCanonicalizing([$late->order_number, $next->order_number], $numbers('status=pending,delivered&date_to=2026-11-03'));
        $this->assertSame([$cod->order_number], $numbers('payment_method=payhere'));
        $this->assertSame([$late->order_number], $numbers('search=late%20night'));

        $this->getJson('/api/v1/admin/orders?status=bogus&date_from=yesterday', $headers)
            ->assertUnprocessable()->assertJsonValidationErrors(['status', 'date_from']);
    }
}
