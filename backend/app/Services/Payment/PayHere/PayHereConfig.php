<?php

namespace App\Services\Payment\PayHere;

/** PayHere settings from config/services.php. The merchant secret is only ever read here. */
class PayHereConfig
{
    public function merchantId(): string
    {
        return (string) config('services.payhere.merchant_id');
    }

    public function merchantSecret(): string
    {
        return (string) config('services.payhere.merchant_secret');
    }

    public function isConfigured(): bool
    {
        return $this->merchantId() !== '' && $this->merchantSecret() !== '';
    }

    public function isSandbox(): bool
    {
        return (bool) config('services.payhere.sandbox');
    }

    public function checkoutUrl(): string
    {
        return $this->isSandbox() ? config('services.payhere.sandbox_checkout_url') : config('services.payhere.live_checkout_url');
    }

    public function returnUrl(): string
    {
        return (string) config('services.payhere.return_url');
    }

    public function cancelUrl(): string
    {
        return (string) config('services.payhere.cancel_url');
    }

    public function notifyUrl(): string
    {
        return (string) (config('services.payhere.notify_url') ?: route('api.v1.payments.payhere.notify'));
    }
}
