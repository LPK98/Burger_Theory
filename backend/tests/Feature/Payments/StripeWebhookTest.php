<?php

namespace Tests\Feature\Payments;

use App\Enums\OrderStatus;
use App\Models\Order;
use App\Models\PaymentEvent;
use App\Models\Product;
use App\Models\User;
use App\Notifications\PaymentReceived;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\Fakes\FakeStripeHttpClient;
use Tests\TestCase;

class StripeWebhookTest extends TestCase
{
    use RefreshDatabase;

    private FakeStripeHttpClient $stripe;

    private User $user;

    private Order $order;

    private string $sessionId;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->stripe = $this->fakeStripe();

        $this->user = $this->customer();
        $product = Product::factory()->price(1450)->stock(10)->create();
        $number = $this->placeOrder($this->user, [[$product, 2]], 'stripe')->assertCreated()->json('data.order_number');
        $this->postJson('/api/v1/payments/stripe', ['order_number' => $number], $this->bearer($this->user))->assertOk();

        $this->order = Order::query()->where('order_number', $number)->firstOrFail();
        $this->sessionId = $this->order->payments()->first()->provider_checkout_id;
        $this->app['auth']->forgetGuards();
    }

    public function test_a_verified_completed_session_marks_the_order_paid(): void
    {
        $this->postStripeEvent('checkout.session.completed', $this->stripe->completeSession($this->sessionId))
            ->assertOk()->assertJsonPath('outcome', 'processed');

        $payment = $this->order->payments()->first();
        $this->assertSame('paid', $payment->status->value);
        $this->assertStringStartsWith('pi_test_', $payment->provider_payment_id);
        $this->assertSame('************4242', $payment->card_mask);
        $this->assertNotNull($payment->paid_at);
        $this->assertSame('paid', $this->order->refresh()->payment_status->value);
        Notification::assertSentTo($this->user, PaymentReceived::class);

        // The admin can now send it to the kitchen.
        $this->patchJson("/api/v1/admin/orders/{$this->order->order_number}/status", ['status' => 'confirmed'], $this->bearer($this->admin()))
            ->assertOk();
    }

    public function test_redelivered_events_are_idempotent(): void
    {
        $session = $this->stripe->completeSession($this->sessionId);
        $this->postStripeEvent('checkout.session.completed', $session, null, 'evt_same')->assertOk()->assertJsonPath('outcome', 'processed');
        $this->postStripeEvent('checkout.session.completed', $session, null, 'evt_same')->assertOk()->assertJsonPath('outcome', 'duplicate');
        // A different event for the same session (e.g. async_payment_succeeded) is a no-op too.
        $this->postStripeEvent('checkout.session.async_payment_succeeded', $session)->assertOk()->assertJsonPath('outcome', 'duplicate');

        Notification::assertSentToTimes($this->user, PaymentReceived::class, 1);
        $this->assertSame(1, $this->order->payments()->where('status', 'paid')->count());
    }

    public function test_an_invalid_signature_is_rejected_and_changes_nothing(): void
    {
        $this->postStripeEvent('checkout.session.completed', $this->stripe->completeSession($this->sessionId), 'whsec_wrong')
            ->assertStatus(400);

        $this->call('POST', '/api/v1/payments/stripe/webhook', [], [], [], ['CONTENT_TYPE' => 'application/json'], '{"type":"checkout.session.completed"}')
            ->assertStatus(400);

        $this->assertSame('pending', $this->order->refresh()->payment_status->value);
        $this->assertSame(2, PaymentEvent::query()->where('outcome_reason', 'invalid_signature')->where('signature_valid', false)->count());
    }

    public function test_the_webhook_refuses_to_run_without_a_signing_secret(): void
    {
        config(['services.stripe.webhook_secret' => '']);

        $this->postStripeEvent('checkout.session.completed', $this->stripe->completeSession($this->sessionId))->assertStatus(503);
        $this->assertSame('pending', $this->order->refresh()->payment_status->value);
    }

    public function test_an_amount_or_currency_mismatch_is_never_applied(): void
    {
        $session = $this->stripe->completeSession($this->sessionId);

        $this->postStripeEvent('checkout.session.completed', ['amount_total' => 100] + $session)->assertOk()->assertJsonPath('outcome', 'rejected');
        $this->postStripeEvent('checkout.session.completed', ['currency' => 'lkr'] + $session)->assertOk()->assertJsonPath('outcome', 'rejected');

        $this->assertSame('pending', $this->order->refresh()->payment_status->value);
        $this->assertSame(2, PaymentEvent::query()->where('outcome_reason', 'amount_mismatch')->count());
    }

    public function test_sessions_this_server_did_not_create_are_ignored(): void
    {
        $session = ['id' => 'cs_test_someone_else', 'client_reference_id' => "{$this->order->order_number}-1"] + $this->stripe->completeSession($this->sessionId);

        $this->postStripeEvent('checkout.session.completed', $session)->assertOk()->assertJsonPath('outcome', 'ignored');
        $this->postStripeEvent('customer.created', ['id' => 'cus_1', 'object' => 'customer'])->assertOk()->assertJsonPath('outcome', 'ignored');

        $this->assertSame('pending', $this->order->refresh()->payment_status->value);
    }

    public function test_delayed_payment_methods_wait_for_the_async_result(): void
    {
        $this->postStripeEvent('checkout.session.completed', $this->stripe->completeSession($this->sessionId, 'unpaid'))->assertOk();
        $this->assertSame('pending', $this->order->refresh()->payment_status->value);

        $this->postStripeEvent('checkout.session.async_payment_failed', $this->stripe->sessions[$this->sessionId])->assertOk();
        $this->assertSame('failed', $this->order->refresh()->payment_status->value);
        $this->assertTrue($this->order->isAwaitingOnlinePayment()); // the shopper may try again
    }

    public function test_an_expired_session_cancels_the_attempt(): void
    {
        $this->postStripeEvent('checkout.session.expired', $this->stripe->expireSession($this->sessionId))->assertOk();

        $this->assertSame('cancelled', $this->order->payments()->first()->status->value);
        $this->assertSame('cancelled', $this->order->refresh()->payment_status->value);
        $this->assertSame(OrderStatus::Pending, $this->order->status);
    }

    public function test_a_dispute_marks_the_payment_charged_back(): void
    {
        $session = $this->stripe->completeSession($this->sessionId);
        $this->postStripeEvent('checkout.session.completed', $session)->assertOk();

        $this->postStripeEvent('charge.dispute.created', [
            'id' => 'dp_test_1', 'object' => 'dispute', 'payment_intent' => $session['payment_intent'], 'reason' => 'fraudulent', 'amount' => 2900,
        ])->assertOk()->assertJsonPath('outcome', 'processed');

        $this->assertSame('charged_back', $this->order->refresh()->payment_status->value);
        $this->assertSame('charged_back', $this->order->payments()->first()->status->value);
    }

    public function test_money_arriving_for_a_cancelled_order_is_flagged_for_refund(): void
    {
        // The shopper pays on the hosted page just as staff reject the order.
        $session = $this->stripe->completeSession($this->sessionId);
        $this->patchJson("/api/v1/admin/orders/{$this->order->order_number}/status", ['status' => 'rejected', 'note' => 'Out of buns'], $this->bearer($this->admin()))
            ->assertOk();
        $this->app['auth']->forgetGuards();

        $this->postStripeEvent('checkout.session.completed', $session)->assertOk();

        $this->order->refresh();
        $this->assertSame(OrderStatus::Rejected, $this->order->status);
        $this->assertSame('refund_required', $this->order->payment_status->value);
        Notification::assertNotSentTo($this->user, PaymentReceived::class);
    }
}
