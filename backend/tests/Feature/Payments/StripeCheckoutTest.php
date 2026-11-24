<?php

namespace Tests\Feature\Payments;

use App\Enums\OrderStatus;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use App\Notifications\PaymentReceived;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\Fakes\FakeStripeHttpClient;
use Tests\TestCase;

class StripeCheckoutTest extends TestCase
{
    use RefreshDatabase;

    private FakeStripeHttpClient $stripe;

    private User $user;

    private Order $order;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->stripe = $this->fakeStripe();

        $this->user = $this->customer(['email' => 'nimali@example.com']);
        $product = Product::factory()->price(1450)->stock(10)->create(['name' => 'The Theory Classic']);
        $number = $this->placeOrder($this->user, [[$product, 2]], 'stripe')
            ->assertCreated()
            ->assertJsonPath('data.payment_method', 'stripe')
            ->assertJsonPath('data.currency', 'USD')
            ->assertJsonPath('data.total', 2900)
            ->assertJsonPath('data.can_pay_online', true)
            ->assertJsonPath('meta.next_action', 'stripe_checkout')
            ->json('data.order_number');

        $this->order = Order::query()->where('order_number', $number)->firstOrFail();
    }

    public function test_stripe_is_offered_only_once_a_secret_key_is_set(): void
    {
        $this->getJson('/api/v1/restaurant')->assertJsonPath('data.payment_methods', ['stripe', 'payhere', 'cod']);

        config(['services.stripe.secret_key' => '']);
        $this->getJson('/api/v1/restaurant')->assertJsonPath('data.payment_methods', ['payhere', 'cod']);

        $product = Product::factory()->price(1450)->create();
        $this->placeOrder($this->customer(), [[$product, 1]], 'stripe')
            ->assertStatus(503)->assertJsonPath('code', 'payment_gateway_not_configured');
    }

    public function test_checkout_creates_a_session_for_the_server_priced_total(): void
    {
        $response = $this->postJson('/api/v1/payments/stripe', ['order_number' => $this->order->order_number], $this->bearer($this->user))
            ->assertOk()
            ->assertJsonPath('data.test_mode', true)
            ->assertJsonPath('data.payment.reference', "{$this->order->order_number}-1")
            ->assertJsonPath('data.payment.status', 'pending');

        $this->assertStringStartsWith('https://checkout.stripe.com/c/pay/cs_test_', $response->json('data.url'));
        $this->assertStringNotContainsString('sk_test_fake_key', $response->getContent());
        $this->assertStringNotContainsString(self::STRIPE_WEBHOOK_SECRET, $response->getContent());

        [$create] = $this->stripe->requestsTo('post', '#^/v1/checkout/sessions$#');
        $params = $create['params'];
        $this->assertSame('payment', $params['mode']);
        $this->assertSame('usd', $params['line_items'][0]['price_data']['currency']);
        $this->assertSame(2900, (int) $params['line_items'][0]['price_data']['unit_amount']);
        $this->assertSame("{$this->order->order_number}-1", $params['client_reference_id']);
        $this->assertSame('nimali@example.com', $params['customer_email']);
        $this->assertSame($this->order->order_number, $params['metadata']['order_number']);
        $this->assertSame($this->order->order_number, $params['payment_intent_data']['metadata']['order_number']);
        $this->assertStringContainsString('2 × The Theory Classic', $params['line_items'][0]['price_data']['product_data']['description']);
        $this->assertSame('http://localhost:5173/?checkout=complete&order='.$this->order->order_number, $params['success_url']);
        $this->assertSame('http://localhost:5173/?checkout=cancelled&order='.$this->order->order_number, $params['cancel_url']);
        $this->assertGreaterThanOrEqual(now()->addMinutes(30)->getTimestamp(), (int) $params['expires_at']);
        $this->assertStringStartsWith("checkout-session:{$this->order->order_number}-1:", $create['headers']['idempotency-key']);

        $payment = $this->order->payments()->first();
        $this->assertStringStartsWith('cs_test_', $payment->provider_checkout_id);
        $this->assertSame($response->json('data.url'), $payment->checkout_url);
    }

    public function test_an_open_session_is_reused_instead_of_creating_another(): void
    {
        $headers = $this->bearer($this->user);
        $first = $this->postJson('/api/v1/payments/stripe', ['order_number' => $this->order->order_number], $headers)->json('data.url');
        $second = $this->postJson('/api/v1/payments/stripe', ['order_number' => $this->order->order_number], $headers)->json('data.url');

        $this->assertSame($first, $second);
        $this->assertCount(1, $this->stripe->requestsTo('post', '#^/v1/checkout/sessions$#'));
        $this->assertSame(1, $this->order->payments()->count());
    }

    public function test_a_gateway_error_can_be_retried_without_a_second_session(): void
    {
        $headers = $this->bearer($this->user);
        $this->stripe->failNext();

        $this->postJson('/api/v1/payments/stripe', ['order_number' => $this->order->order_number], $headers)
            ->assertStatus(502)->assertJsonPath('code', 'payment_gateway_error');
        $this->assertNull($this->order->payments()->first()->provider_checkout_id);

        $this->postJson('/api/v1/payments/stripe', ['order_number' => $this->order->order_number], $headers)->assertOk();

        // Same attempt, same planned expiry, so the retry sent the same idempotency key.
        $keys = array_column(array_column($this->stripe->requestsTo('post', '#^/v1/checkout/sessions$#'), 'headers'), 'idempotency-key');
        $this->assertCount(2, $keys);
        $this->assertSame($keys[0], $keys[1]);
        $this->assertSame(1, $this->order->payments()->count());
    }

    public function test_only_the_owner_can_pay_and_only_stripe_orders(): void
    {
        $this->postJson('/api/v1/payments/stripe', ['order_number' => $this->order->order_number], $this->bearer($this->customer()))
            ->assertNotFound();

        $product = Product::factory()->price(1450)->create();
        $cod = $this->placeOrder($this->user, [[$product, 1]], 'cod')->json('data.order_number');
        $this->postJson('/api/v1/payments/stripe', ['order_number' => $cod], $this->bearer($this->user))
            ->assertStatus(409)->assertJsonPath('code', 'order_not_payable');

        $this->app['auth']->forgetGuards();
        $this->postJson('/api/v1/payments/stripe', ['order_number' => $this->order->order_number])->assertUnauthorized();
    }

    public function test_confirm_on_return_applies_the_session_retrieved_from_stripe(): void
    {
        $headers = $this->bearer($this->user);
        $this->postJson('/api/v1/payments/stripe', ['order_number' => $this->order->order_number], $headers)->assertOk();

        // Back on the storefront before paying: nothing changes.
        $this->postJson('/api/v1/payments/stripe/confirm', ['order_number' => $this->order->order_number], $headers)
            ->assertOk()->assertJsonPath('data.payment_status', 'pending');

        $sessionId = $this->order->payments()->first()->provider_checkout_id;
        $this->stripe->completeSession($sessionId);

        $this->postJson('/api/v1/payments/stripe/confirm', ['order_number' => $this->order->order_number], $headers)
            ->assertOk()
            ->assertJsonPath('data.payment_status', 'paid')
            ->assertJsonPath('data.payment.card_mask', '************4242')
            ->assertJsonPath('data.payment.provider_method', 'visa')
            ->assertJsonPath('data.can_pay_online', false);

        // The webhook arriving afterwards changes nothing and sends no second receipt.
        $this->app['auth']->forgetGuards();
        $this->postStripeEvent('checkout.session.completed', $this->stripe->sessions[$sessionId])->assertOk()->assertJsonPath('outcome', 'duplicate');
        Notification::assertSentToTimes($this->user, PaymentReceived::class, 1);
        $this->assertDatabaseHas('payment_events', ['provider' => 'stripe', 'outcome' => 'processed', 'signature_valid' => true]);
    }

    public function test_an_expired_session_opens_a_new_attempt(): void
    {
        $headers = $this->bearer($this->user);
        $this->postJson('/api/v1/payments/stripe', ['order_number' => $this->order->order_number], $headers)->assertOk();

        $this->travel(40)->minutes();

        $response = $this->postJson('/api/v1/payments/stripe', ['order_number' => $this->order->order_number], $headers)
            ->assertOk()
            ->assertJsonPath('data.payment.reference', "{$this->order->order_number}-2");

        $this->assertSame(['cancelled', 'pending'], $this->order->payments()->pluck('status')->map->value->all());
        $this->assertCount(2, $this->stripe->requestsTo('post', '#^/v1/checkout/sessions$#'));
        $this->assertStringContainsString($this->order->payments()->get()->last()->provider_checkout_id, $response->json('data.url'));
    }

    public function test_unpaid_stripe_orders_cannot_be_confirmed_and_expire(): void
    {
        $this->patchJson("/api/v1/admin/orders/{$this->order->order_number}/status", ['status' => 'confirmed'], $this->bearer($this->admin()))
            ->assertStatus(409);

        $this->postJson('/api/v1/payments/stripe', ['order_number' => $this->order->order_number], $this->bearer($this->user))->assertOk();
        $this->travel(61)->minutes();
        $this->artisan('orders:expire-unpaid')->assertSuccessful();

        $this->assertSame(OrderStatus::Cancelled, $this->order->refresh()->status);
        // The session had already run out (30 minutes), so there was nothing left to close.
        $this->assertCount(0, $this->stripe->requestsTo('post', '#/expire$#'));
    }

    public function test_cancelling_an_order_closes_its_open_session(): void
    {
        $headers = $this->bearer($this->user);
        $this->postJson('/api/v1/payments/stripe', ['order_number' => $this->order->order_number], $headers)->assertOk();
        $sessionId = $this->order->payments()->first()->provider_checkout_id;

        $this->postJson("/api/v1/orders/{$this->order->order_number}/cancel", [], $headers)->assertOk();

        $this->assertCount(1, $this->stripe->requestsTo('post', '#^/v1/checkout/sessions/'.$sessionId.'/expire$#'));
        $this->assertSame('expired', $this->stripe->sessions[$sessionId]['status']);
        $this->postJson('/api/v1/payments/stripe', ['order_number' => $this->order->order_number], $headers)
            ->assertStatus(409)->assertJsonPath('code', 'order_not_payable');
    }
}
