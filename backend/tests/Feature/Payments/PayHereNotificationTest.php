<?php

namespace Tests\Feature\Payments;

use App\Enums\OrderStatus;
use App\Models\Order;
use App\Models\PaymentEvent;
use App\Models\Product;
use App\Notifications\PaymentReceived;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class PayHereNotificationTest extends TestCase
{
    use RefreshDatabase;

    private Order $order;

    private string $reference;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $user = $this->customer();
        $product = Product::factory()->price(145000)->stock(10)->create();
        $number = $this->placeOrder($user, [[$product, 2]], 'payhere')->assertCreated()->json('data.order_number');

        $this->order = Order::query()->where('order_number', $number)->firstOrFail();
        $this->reference = "{$number}-1";
        $this->app['auth']->forgetGuards();
    }

    public function test_verified_success_marks_payment_and_order_paid(): void
    {
        $this->postPayHereNotification($this->payHereNotification($this->reference, '2900.00', 2, ['payment_id' => '320025071278']))
            ->assertOk()
            ->assertSeeText('OK');

        $payment = $this->order->payments()->first();
        $this->assertSame('paid', $payment->status->value);
        $this->assertSame('320025071278', $payment->provider_payment_id);
        $this->assertSame('VISA', $payment->provider_method);
        $this->assertSame('************1292', $payment->card_mask);
        $this->assertNotNull($payment->paid_at);

        $this->order->refresh();
        $this->assertSame('paid', $this->order->payment_status->value);
        $this->assertNotNull($this->order->paid_at);
        $this->assertSame(OrderStatus::Pending, $this->order->status); // the kitchen still confirms it

        Notification::assertSentTo($this->order->user, PaymentReceived::class);

        $event = PaymentEvent::query()->sole();
        $this->assertTrue($event->signature_valid);
        $this->assertSame('processed', $event->outcome);
        $this->assertArrayNotHasKey('card_holder_name', $event->payload);
        $this->assertArrayNotHasKey('card_expiry', $event->payload);
    }

    public function test_duplicate_notifications_are_idempotent(): void
    {
        $payload = $this->payHereNotification($this->reference, '2900.00', 2);

        $this->postPayHereNotification($payload)->assertOk();
        $paidAt = $this->order->payments()->first()->paid_at;
        $this->postPayHereNotification($payload)->assertOk();
        $this->postPayHereNotification($payload)->assertOk();

        $this->assertSame(1, $this->order->payments()->where('status', 'paid')->count());
        $this->assertEquals($paidAt, $this->order->payments()->first()->paid_at);
        $this->assertSame(['processed', 'duplicate', 'duplicate'], PaymentEvent::query()->orderBy('id')->pluck('outcome')->all());
        Notification::assertSentToTimes($this->order->user, PaymentReceived::class, 1);
    }

    public function test_invalid_signature_is_rejected_and_changes_nothing(): void
    {
        $payload = $this->payHereNotification($this->reference, '2900.00', 2, ['md5sig' => strtoupper(md5('forged'))]);

        $this->postPayHereNotification($payload)->assertStatus(400)->assertSeeText('REJECTED');

        $this->assertSame('pending', $this->order->refresh()->payment_status->value);
        $this->assertDatabaseHas('payment_events', ['outcome' => 'rejected', 'outcome_reason' => 'invalid_signature', 'signature_valid' => false]);
        Notification::assertNotSentTo($this->order->user, PaymentReceived::class);
    }

    public function test_amount_or_currency_mismatch_is_rejected_even_with_a_valid_signature(): void
    {
        // Correctly signed (e.g. by someone holding a leaked secret) but for less money.
        $this->postPayHereNotification($this->payHereNotification($this->reference, '1.00', 2))->assertStatus(400);
        $this->postPayHereNotification($this->payHereNotification($this->reference, '2900.00', 2, ['payhere_currency' => 'USD']))->assertStatus(400);

        $this->assertSame('pending', $this->order->refresh()->payment_status->value);
        $this->assertSame(2, PaymentEvent::query()->where('outcome_reason', 'amount_mismatch')->count());
    }

    public function test_merchant_mismatch_unknown_reference_and_missing_fields_are_rejected(): void
    {
        $this->postPayHereNotification($this->payHereNotification($this->reference, '2900.00', 2, ['merchant_id' => '9999999']))->assertStatus(400);
        $this->postPayHereNotification($this->payHereNotification('BT-000000-NOPE00-1', '2900.00', 2))->assertStatus(400);
        $this->postPayHereNotification(['order_id' => $this->reference, 'status_code' => '2'])->assertStatus(400);

        $this->assertSame(
            ['merchant_mismatch', 'unknown_reference', 'missing_merchant_id'],
            PaymentEvent::query()->orderBy('id')->pluck('outcome_reason')->all(),
        );
        $this->assertSame('pending', $this->order->refresh()->payment_status->value);
    }

    public function test_notify_endpoint_only_accepts_post(): void
    {
        $this->getJson('/api/v1/payments/payhere/notify')->assertStatus(405);
    }

    public function test_a_payhere_payment_id_cannot_be_replayed_onto_another_order(): void
    {
        $this->postPayHereNotification($this->payHereNotification($this->reference, '2900.00', 2, ['payment_id' => '320000000001']))->assertOk();

        $product = Product::factory()->price(145000)->create();
        $other = $this->placeOrder($this->customer(), [[$product, 2]], 'payhere')->json('data.order_number');
        $this->app['auth']->forgetGuards();

        $this->postPayHereNotification($this->payHereNotification("{$other}-1", '2900.00', 2, ['payment_id' => '320000000001']))
            ->assertStatus(400);

        $this->assertSame('pending', Order::query()->where('order_number', $other)->firstOrFail()->payment_status->value);
        $this->assertDatabaseHas('payment_events', ['outcome' => 'rejected', 'outcome_reason' => 'payment_id_conflict']);
    }

    public function test_late_pending_or_failed_status_never_downgrades_a_paid_payment(): void
    {
        $this->postPayHereNotification($this->payHereNotification($this->reference, '2900.00', 2))->assertOk();
        $this->postPayHereNotification($this->payHereNotification($this->reference, '2900.00', 0))->assertOk();
        $this->postPayHereNotification($this->payHereNotification($this->reference, '2900.00', -2))->assertOk();

        $this->assertSame('paid', $this->order->refresh()->payment_status->value);
        $this->assertSame(['processed', 'ignored', 'ignored'], PaymentEvent::query()->orderBy('id')->pluck('outcome')->all());
    }

    public function test_failed_and_cancelled_payments_allow_a_retry(): void
    {
        $this->postPayHereNotification($this->payHereNotification($this->reference, '2900.00', -2))->assertOk();
        $this->assertSame('failed', $this->order->refresh()->payment_status->value);

        $headers = $this->bearer($this->order->user);
        $this->getJson("/api/v1/orders/{$this->order->order_number}", $headers)
            ->assertJsonPath('data.payment_status', 'failed')
            ->assertJsonPath('data.can_pay_online', true);

        $retry = $this->postJson('/api/v1/payments/payhere', ['order_number' => $this->order->order_number], $headers)
            ->assertOk()->json('data.fields.order_id');
        $this->assertSame("{$this->order->order_number}-2", $retry);

        $this->app['auth']->forgetGuards();
        $this->postPayHereNotification($this->payHereNotification($retry, '2900.00', 2))->assertOk();
        $this->assertSame('paid', $this->order->refresh()->payment_status->value);
        $this->assertSame(['failed', 'paid'], $this->order->payments()->pluck('status')->map->value->all());
    }

    public function test_chargeback_after_payment_is_recorded(): void
    {
        $this->postPayHereNotification($this->payHereNotification($this->reference, '2900.00', 2))->assertOk();
        $this->postPayHereNotification($this->payHereNotification($this->reference, '2900.00', -3))->assertOk();

        $this->assertSame('charged_back', $this->order->refresh()->payment_status->value);
        $this->assertSame('charged_back', $this->order->payments()->first()->status->value);
    }

    public function test_payment_arriving_after_the_order_was_cancelled_is_flagged_for_refund(): void
    {
        $this->travel(2)->minutes();
        $this->artisan('orders:expire-unpaid', ['--minutes' => 1])->assertSuccessful();
        $this->assertSame(OrderStatus::Cancelled, $this->order->refresh()->status);

        $this->postPayHereNotification($this->payHereNotification($this->reference, '2900.00', 2))->assertOk();

        $this->order->refresh();
        $this->assertSame(OrderStatus::Cancelled, $this->order->status);
        $this->assertSame('refund_required', $this->order->payment_status->value);
        $this->assertSame('refund_required', $this->order->payments()->first()->status->value);
        Notification::assertNotSentTo($this->order->user, PaymentReceived::class);
    }
}
