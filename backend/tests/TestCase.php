<?php

namespace Tests;

use App\Models\Product;
use App\Models\User;
use App\Services\Payment\PayHere\PayHereSignature;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use RuntimeException;

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
            'payhere_currency' => 'LKR',
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
