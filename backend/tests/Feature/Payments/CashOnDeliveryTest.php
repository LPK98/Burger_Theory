<?php

namespace Tests\Feature\Payments;

use App\Models\Order;
use App\Models\Product;
use App\Notifications\PaymentReceived;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class CashOnDeliveryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    private function codOrder(): array
    {
        $user = $this->customer();
        $product = Product::factory()->price(145000)->create();
        $number = $this->placeOrder($user, [[$product, 1]], 'cod', 'pickup')->assertCreated()->json('data.order_number');

        return [$user, $number];
    }

    private function advance(string $number, array $statuses, array $headers): void
    {
        foreach ($statuses as $status) {
            $this->patchJson("/api/v1/admin/orders/{$number}/status", ['status' => $status], $headers)->assertOk();
        }
    }

    public function test_admin_records_cash_after_handover(): void
    {
        [$user, $number] = $this->codOrder();
        $admin = $this->admin();
        $headers = $this->bearer($admin);

        $this->postJson("/api/v1/admin/orders/{$number}/cod-collection", [], $headers)
            ->assertStatus(409)->assertJsonPath('code', 'cash_not_collectable');

        $this->advance($number, ['confirmed', 'preparing', 'ready', 'delivered'], $headers);

        $this->postJson("/api/v1/admin/orders/{$number}/cod-collection", [], $headers)
            ->assertOk()
            ->assertJsonPath('data.payment_status', 'paid')
            ->assertJsonPath('data.payments.0.status', 'paid');

        $order = Order::query()->where('order_number', $number)->firstOrFail();
        $payment = $order->payments()->first();
        $this->assertSame($admin->id, $payment->collected_by_id);
        $this->assertNotNull($payment->collected_at);
        $this->assertNotNull($order->paid_at);
        Notification::assertSentTo($user, PaymentReceived::class);

        $this->postJson("/api/v1/admin/orders/{$number}/cod-collection", [], $headers)
            ->assertStatus(409)->assertJsonPath('code', 'payment_already_settled');
    }

    public function test_customers_cannot_mark_cash_as_collected(): void
    {
        [$user, $number] = $this->codOrder();

        $this->postJson("/api/v1/admin/orders/{$number}/cod-collection", [], $this->bearer($user))->assertForbidden();
        // There is no customer endpoint that changes a payment; the order stays unpaid.
        $this->assertSame('pending', Order::query()->where('order_number', $number)->firstOrFail()->payment_status->value);
    }

    public function test_only_cash_orders_can_be_collected(): void
    {
        $order = Order::factory()->payhere()->create();

        $this->postJson("/api/v1/admin/orders/{$order->order_number}/cod-collection", [], $this->bearer($this->admin()))
            ->assertStatus(409)->assertJsonPath('code', 'not_cash_on_delivery');
    }

    public function test_cancelled_cash_orders_cannot_be_collected(): void
    {
        [, $number] = $this->codOrder();
        $headers = $this->bearer($this->admin());
        $this->patchJson("/api/v1/admin/orders/{$number}/status", ['status' => 'rejected', 'note' => 'Kitchen closed'], $headers)->assertOk();

        $this->postJson("/api/v1/admin/orders/{$number}/cod-collection", [], $headers)
            ->assertStatus(409)->assertJsonPath('code', 'order_not_payable');
    }
}
