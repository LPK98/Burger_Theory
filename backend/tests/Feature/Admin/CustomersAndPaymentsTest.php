<?php

namespace Tests\Feature\Admin;

use App\Enums\OrderStatus;
use App\Enums\PaymentStatus;
use App\Models\Order;
use App\Models\PaymentEvent;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CustomersAndPaymentsTest extends TestCase
{
    use RefreshDatabase;

    public function test_customer_list_shows_orders_and_spending_without_secrets(): void
    {
        $classic = Product::factory()->price(145000)->create();
        $nimali = $this->customer(['name' => 'Nimali Perera', 'email' => 'nimali@example.test', 'phone' => '0771234567']);
        $kasun = $this->customer(['name' => 'Kasun Silva', 'email' => 'kasun@example.test']);
        $this->customer(['name' => 'Never Ordered']);
        $admin = $this->admin();

        // Nimali: one paid delivered order (counts), one unpaid, one paid then cancelled (doesn't count).
        Order::factory()->for($nimali)->paid()->status(OrderStatus::Delivered)->withItem($classic, 2)->create();
        Order::factory()->for($nimali)->withItem($classic, 1)->create();
        Order::factory()->for($nimali)->paid()->status(OrderStatus::Cancelled)->withItem($classic, 4)->create();
        Order::factory()->for($kasun)->payhere()->paid()->status(OrderStatus::Delivered)->withItem($classic, 3)->create();

        $response = $this->getJson('/api/v1/admin/customers?sort=spent', $this->bearer($admin))->assertOk();

        $this->assertSame(['Kasun Silva', 'Nimali Perera', 'Never Ordered'], array_column($response->json('data'), 'name'));
        $response->assertJsonPath('data.1.orders_count', 3)
            ->assertJsonPath('data.1.total_spent', 290000)
            ->assertJsonPath('data.1.phone', '0771234567')
            ->assertJsonPath('data.2.orders_count', 0)
            ->assertJsonPath('data.2.last_order_at', null)
            ->assertJsonPath('meta.total', 3);

        $this->assertSame(
            ['id', 'name', 'email', 'phone', 'email_verified', 'registered_at', 'orders_count', 'total_spent', 'last_order_at'],
            array_keys($response->json('data.0')),
        );
        $this->assertStringNotContainsString('password', $response->getContent());

        $this->getJson('/api/v1/admin/customers?search=nimali', $this->bearer($admin))->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/admin/customers?has_orders=0', $this->bearer($admin))->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Never Ordered');
    }

    public function test_customer_detail_and_order_history(): void
    {
        $classic = Product::factory()->price(145000)->create(['name' => 'Classic']);
        $customer = $this->customer();
        $admin = $this->admin();
        Order::factory()->for($customer)->paid()->status(OrderStatus::Delivered)->withItem($classic, 2)->create();
        Order::factory()->for($customer)->paid()->status(OrderStatus::Delivered)->withItem($classic, 1)->create();
        Order::factory()->for($customer)->status(OrderStatus::Cancelled)->withItem($classic, 1)->create();
        Order::factory()->withItem($classic, 1)->create(); // someone else

        $this->getJson("/api/v1/admin/customers/{$customer->id}", $this->bearer($admin))
            ->assertOk()
            ->assertJsonPath('data.orders_count', 3)
            ->assertJsonPath('data.completed_orders', 2)
            ->assertJsonPath('data.cancelled_orders', 1)
            ->assertJsonPath('data.total_spent', 435000)
            ->assertJsonPath('data.average_order_value', 217500)
            ->assertJsonPath('data.favourite_products.0', ['name' => 'Classic', 'quantity' => 3]);

        $this->getJson("/api/v1/admin/orders?customer_id={$customer->id}", $this->bearer($admin))->assertJsonCount(3, 'data');

        // Administrators are not customers.
        $this->getJson("/api/v1/admin/customers/{$admin->id}", $this->bearer($admin))->assertNotFound();
    }

    public function test_payments_list_filters_and_summarises(): void
    {
        $admin = $this->admin();
        $paidCard = Order::factory()->payhere()->paid()->total(300000)->create(['customer_name' => 'Ayesha Fernando']);
        Order::factory()->paid()->total(200000)->create();     // COD collected
        Order::factory()->total(150000)->create();             // COD pending
        $failed = Order::factory()->payhere()->total(100000)->create();
        $failed->payments()->update(['status' => PaymentStatus::Failed->value]);

        $this->getJson('/api/v1/admin/payments', $this->bearer($admin))
            ->assertOk()
            ->assertJsonCount(4, 'data')
            ->assertJsonPath('meta.summary.paid', 2)
            ->assertJsonPath('meta.summary.paid_amount', 500000)
            ->assertJsonPath('meta.summary.pending', 1)
            ->assertJsonPath('meta.summary.pending_amount', 150000)
            ->assertJsonPath('meta.summary.failed', 1);

        $this->getJson('/api/v1/admin/payments?method=payhere&status=paid', $this->bearer($admin))
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.order.order_number', $paidCard->order_number)
            ->assertJsonPath('data.0.order.customer_name', 'Ayesha Fernando');

        $this->getJson('/api/v1/admin/payments?search=ayesha', $this->bearer($admin))->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/admin/payments?status=nope', $this->bearer($admin))->assertUnprocessable();
    }

    public function test_payment_detail_summarises_notifications_without_their_payload(): void
    {
        $order = Order::factory()->payhere()->paid()->total(300000)->create();
        $payment = $order->payments()->firstOrFail();
        PaymentEvent::query()->create([
            'payment_id' => $payment->id, 'provider' => 'payhere', 'reference' => $payment->reference,
            'provider_status_code' => 2, 'signature_valid' => true, 'outcome' => 'applied',
            'payload' => ['card_holder_name' => 'Secret Holder', 'md5sig' => 'ABC'], 'ip_address' => '203.0.113.9',
        ]);

        $response = $this->getJson("/api/v1/admin/payments/{$payment->reference}", $this->bearer($this->admin()))
            ->assertOk()
            ->assertJsonPath('data.events.0.signature_valid', true)
            ->assertJsonPath('data.events.0.outcome', 'applied')
            ->assertJsonPath('data.order.order_number', $order->order_number);

        $this->assertStringNotContainsString('Secret Holder', $response->getContent());
        $this->assertStringNotContainsString('203.0.113.9', $response->getContent());
    }
}
