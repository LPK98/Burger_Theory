<?php

namespace App\Services\Payment\Stripe;

use Stripe\StripeClient;

/**
 * Stripe settings from config/services.php (STRIPE_* in .env). The secret key and the
 * webhook signing secret are only ever read here and never leave the server.
 */
class StripeConfig
{
    private ?StripeClient $client = null;

    public function secretKey(): string
    {
        return (string) config('services.stripe.secret_key');
    }

    public function webhookSecret(): string
    {
        return (string) config('services.stripe.webhook_secret');
    }

    /** Payments can be started once the secret key is set. */
    public function isConfigured(): bool
    {
        return $this->secretKey() !== '';
    }

    /** Payments can only be confirmed by webhook once the signing secret is set as well. */
    public function webhookConfigured(): bool
    {
        return $this->webhookSecret() !== '';
    }

    /** sk_test_… / rk_test_… keys talk to a Stripe sandbox; nothing real is charged. */
    public function isTestMode(): bool
    {
        return (bool) preg_match('/^(sk|rk)_test_/', $this->secretKey());
    }

    public function successUrl(): string
    {
        return (string) config('services.stripe.success_url');
    }

    public function cancelUrl(): string
    {
        return (string) config('services.stripe.cancel_url');
    }

    /** How long a Checkout Session stays open (Stripe allows 30 minutes to 24 hours). */
    public function sessionMinutes(): int
    {
        return max(30, min(1440, (int) config('services.stripe.session_minutes', 30)));
    }

    public function client(): StripeClient
    {
        return $this->client ??= new StripeClient(array_filter([
            'api_key' => $this->secretKey(),
            // Network retries reuse the same idempotency key, so they can never double-create.
            'max_network_retries' => 2,
            // Only for a local mock such as stripe-mock; blank means https://api.stripe.com.
            'api_base' => (string) config('services.stripe.api_base') ?: null,
        ]));
    }

    /** Tests swap in a fake client. */
    public function useClient(StripeClient $client): void
    {
        $this->client = $client;
    }
}
