<?php

namespace Tests\Feature\Payments;

use App\Enums\PaymentStatus;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class PayHereCheckoutTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    public function test_checkout_returns_signed_fields_without_the_secret(): void
    {
        $user = $this->customer(['name' => 'Nimali Perera', 'email' => 'nimali@example.com']);
        $product = Product::factory()->price(1725)->create();
        $number = $this->placeOrder($user, [[$product, 2]], 'payhere', 'delivery', [
            'address' => ['recipient_name' => 'Nimali', 'phone' => '0771234567', 'line1' => '12 Galle Road 🍔', 'city' => 'Colombo'],
        ])->assertCreated()->json('data.order_number');

        $response = $this->postJson('/api/v1/payments/payhere', ['order_number' => $number], $this->bearer($user))->assertOk();

        $fields = $response->json('data.fields');
        $this->assertSame('https://sandbox.payhere.lk/pay/checkout', $response->json('data.action_url'));
        $this->assertTrue($response->json('data.sandbox'));
        $this->assertSame('1211149', $fields['merchant_id']);
        $this->assertSame("{$number}-1", $fields['order_id']);
        $this->assertSame('38.00', $fields['amount']); // 2 × $17.25 + $3.50 delivery (below the free-delivery threshold)
        $this->assertSame('USD', $fields['currency']);
        $this->assertSame('Nimali', $fields['first_name']);
        $this->assertSame('Perera', $fields['last_name']);
        $this->assertSame('12 Galle Road', $fields['address']); // emoji stripped for PayHere
        $this->assertSame(url('/api/v1/payments/payhere/notify'), $fields['notify_url']);
        $this->assertStringStartsWith('http://localhost:5173/checkout/complete?order=', $fields['return_url']);

        $expected = strtoupper(md5('1211149'."{$number}-1".'38.00'.'USD'.strtoupper(md5('test-merchant-secret'))));
        $this->assertSame($expected, $fields['hash']);

        $this->assertStringNotContainsString('test-merchant-secret', $response->getContent());
        $this->assertStringNotContainsString(strtoupper(md5('test-merchant-secret')), $response->getContent());
    }

    public function test_repeat_checkout_reuses_the_pending_attempt_and_retries_after_failure(): void
    {
        $user = $this->customer();
        $product = Product::factory()->price(145000)->create();
        $number = $this->placeOrder($user, [[$product, 1]], 'payhere')->json('data.order_number');
        $headers = $this->bearer($user);

        $this->postJson('/api/v1/payments/payhere', ['order_number' => $number], $headers)->assertJsonPath('data.fields.order_id', "{$number}-1");
        $this->postJson('/api/v1/payments/payhere', ['order_number' => $number], $headers)->assertJsonPath('data.fields.order_id', "{$number}-1");

        Payment::query()->where('reference', "{$number}-1")->update(['status' => PaymentStatus::Failed->value]);
        Order::query()->where('order_number', $number)->update(['payment_status' => PaymentStatus::Failed->value]);

        $this->postJson('/api/v1/payments/payhere', ['order_number' => $number], $headers)
            ->assertOk()
            ->assertJsonPath('data.fields.order_id', "{$number}-2")
            ->assertJsonPath('data.payment.status', 'pending');

        $this->assertSame('pending', Order::query()->where('order_number', $number)->firstOrFail()->payment_status->value);
    }

    public function test_only_unpaid_payhere_orders_can_be_paid(): void
    {
        $user = $this->customer();
        $product = Product::factory()->price(145000)->create();
        $cod = $this->placeOrder($user, [[$product, 1]], 'cod')->json('data.order_number');
        $paid = Order::factory()->for($user)->payhere()->paid()->create();

        $headers = $this->bearer($user);
        $this->postJson('/api/v1/payments/payhere', ['order_number' => $cod], $headers)->assertStatus(409)->assertJsonPath('code', 'order_not_payable');
        $this->postJson('/api/v1/payments/payhere', ['order_number' => $paid->order_number], $headers)->assertStatus(409)->assertJsonPath('code', 'payment_already_settled');
    }
}
