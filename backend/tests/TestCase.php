<?php

namespace Tests;

use App\Models\Product;
use App\Models\User;
use App\Services\Payment\PayHere\PayHereSignature;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use RuntimeException;
use Stripe\ApiRequestor;
use Tests\Fakes\FakeStripeHttpClient;

abstract class TestCase extends BaseTestCase
{
    /**
     * RefreshDatabase drops every table, so refuse to boot tests against anything but a *_test
     * database. (Checked here because createApplication runs before any trait's setUp.)
     */
    public function createApplication()
    {
        $app = parent::createApplication();

        $connection = $app['config']->get('database.default');
        $database = (string) $app['config']->get("database.connections.{$connection}.database");
        if (! str_ends_with($database, '_test')) {
            throw new RuntimeException("Refusing to run tests against database [{$database}]: test databases must end in _test.");
        }

        return $app;
    }

    protected function tearDown(): void
    {
        // The SDK's HTTP client is static; never let a fake leak into the next test.
        ApiRequestor::setHttpClient(null);

        parent::tearDown();
    }

    protected const STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';

    /** Configures Stripe with fake keys and routes the real SDK to an in-memory fake API. */
    protected function fakeStripe(): FakeStripeHttpClient
    {
        config([
            'services.stripe.secret_key' => 'sk_test_fake_key',
            'services.stripe.webhook_secret' => self::STRIPE_WEBHOOK_SECRET,
        ]);
        $fake = new FakeStripeHttpClient;
        ApiRequestor::setHttpClient($fake);

        return $fake;
    }

    /**
     * Posts a webhook event signed the way Stripe signs it (HMAC-SHA256 of "timestamp.body").
     *
     * @param  array<string, mixed>  $object
     */
    protected function postStripeEvent(string $type, array $object, ?string $secret = null, ?string $eventId = null): TestResponse
    {
        $body = json_encode([
            'id' => $eventId ?? 'evt_test_'.Str::random(16),
            'object' => 'event',
            'type' => $type,
            'livemode' => false,
            'created' => time(),
            'api_version' => '2026-11-18.endive',
            'data' => ['object' => $object],
        ]);
        $timestamp = time();
        $signature = hash_hmac('sha256', "{$timestamp}.{$body}", $secret ?? self::STRIPE_WEBHOOK_SECRET);

        return $this->call('POST', '/api/v1/payments/stripe/webhook', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_STRIPE_SIGNATURE' => "t={$timestamp},v1={$signature}",
        ], $body);
    }

    protected function customer(array $attributes = []): User
    {
        return User::factory()->create($attributes);
    }

    protected function admin(): User
    {
        return User::factory()->admin()->create();
    }

    /**
     * Authorization header for a real Sanctum token (exercises the same path as the frontend).
     * Guards are reset so a previous request's user is not reused inside the same test.
     */
    protected function bearer(User $user): array
    {
        $this->app['auth']->forgetGuards();

        return ['Authorization' => 'Bearer '.$user->createToken('test')->plainTextToken];
    }

    /** Fills the user's server cart and places an order through the API. */
    protected function placeOrder(User $user, array $lines, string $payment = 'cod', string $fulfilment = 'pickup', array $extra = [], array $headers = []): TestResponse
    {
        $auth = $this->bearer($user);
        foreach ($lines as [$product, $quantity]) {
            /** @var Product $product */
            $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => $quantity], $auth)->assertSuccessful();
        }

        return $this->postJson('/api/v1/orders', ['payment_method' => $payment, 'fulfilment_type' => $fulfilment] + $extra, $auth + $headers);
    }

    /**
     * A PayHere notification signed the way PayHere signs it.
     *
     * @return array<string, string>
     */
    protected function payHereNotification(string $reference, string $amount, int $statusCode = 2, array $overrides = []): array
    {
        $payload = array_merge([
            'merchant_id' => config('services.payhere.merchant_id'),
            'order_id' => $reference,
            'payment_id' => '3200'.Str::random(8),
            'payhere_amount' => $amount,
            'payhere_currency' => 'USD',
            'status_code' => (string) $statusCode,
            'status_message' => $statusCode === 2 ? 'Successfully completed the payment.' : 'Status '.$statusCode,
            'method' => 'VISA',
            'card_holder_name' => 'Test Holder',
            'card_no' => '************1292',
            'card_expiry' => '1230',
            'custom_1' => '',
            'custom_2' => '',
        ], $overrides);

        $payload['md5sig'] ??= PayHereSignature::notificationSignature(
            $payload['merchant_id'],
            $payload['order_id'],
            $payload['payhere_amount'],
            $payload['payhere_currency'],
            $payload['status_code'],
            (string) config('services.payhere.merchant_secret'),
        );

        return $payload;
    }

    protected function postPayHereNotification(array $payload): TestResponse
    {
        // PayHere posts application/x-www-form-urlencoded, not JSON.
        return $this->post('/api/v1/payments/payhere/notify', $payload);
    }
}
