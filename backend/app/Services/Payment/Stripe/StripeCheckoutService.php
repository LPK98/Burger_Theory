<?php

namespace App\Services\Payment\Stripe;

use App\Enums\PaymentMethod;
use App\Enums\PaymentStatus;
use App\Exceptions\PaymentException;
use App\Models\Order;
use App\Models\Payment;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Stripe\Checkout\Session;
use Stripe\Exception\ApiErrorException;

/**
 * Opens a Stripe Checkout Session (Stripe's hosted payment page) for an order this API has
 * already priced. The browser only ever receives the session URL; nothing here marks the
 * order as paid. Only StripePaymentHandler does that, from a verified webhook or from the
 * session it retrieves from Stripe itself.
 *
 * One payment attempt = one Checkout Session. While a session is open it is reused; once it
 * expired or failed, a new attempt (new reference, new session) is opened.
 */
class StripeCheckoutService
{
    /** Reuse an open session only if the shopper still has this long to pay. */
    private const MIN_REMAINING_SECONDS = 120;

    public function __construct(private readonly StripeConfig $config) {}

    /**
     * @return array{payment: Payment, url: string, expires_at: CarbonImmutable, test_mode: bool}
     */
    public function start(Order $order): array
    {
        if (! $this->config->isConfigured()) {
            throw PaymentException::gatewayNotConfigured();
        }

        $payment = DB::transaction(function () use ($order) {
            $locked = Order::query()->whereKey($order->id)->lockForUpdate()->firstOrFail();

            if ($locked->payment_method !== PaymentMethod::Stripe) {
                throw PaymentException::notPayable('This order is not paid by card through Stripe.');
            }
            if ($locked->payment_status === PaymentStatus::Paid) {
                throw PaymentException::alreadySettled();
            }
            if (! $locked->isAwaitingOnlinePayment()) {
                throw PaymentException::notPayable('This order can no longer be paid.');
            }

            /** @var Payment|null $latest */
            $latest = $locked->payments()->where('method', PaymentMethod::Stripe->value)->reorder()->orderByDesc('id')->lockForUpdate()->first();

            if ($latest !== null && $latest->status === PaymentStatus::Pending) {
                if ($latest->provider_checkout_id === null) {
                    return $this->planSession($latest);
                }
                if ($latest->checkout_expires_at !== null && $latest->checkout_expires_at->gt(now()->addSeconds(self::MIN_REMAINING_SECONDS))) {
                    return $latest; // Still open: send the shopper back to the same page.
                }
                // The session ran out without a payment. Stripe sends checkout.session.expired
                // too; whichever arrives first wins and the other changes nothing.
                $latest->update(['status' => PaymentStatus::Cancelled, 'provider_status_message' => 'expired']);
            } elseif ($latest !== null && ! $latest->status->allowsRetry()) {
                throw PaymentException::notPayable('This order can no longer be paid.');
            }

            $attempt = $locked->payments()->count() + 1;
            $payment = $locked->payments()->create([
                'method' => PaymentMethod::Stripe,
                'status' => PaymentStatus::Pending,
                'amount' => $locked->total,
                'currency' => $locked->currency,
                'reference' => "{$locked->order_number}-{$attempt}",
            ]);
            $locked->update(['payment_status' => PaymentStatus::Pending]);

            return $this->planSession($payment);
        });

        if ($payment->provider_checkout_id === null) {
            $payment = $this->createSession($order->refresh(), $payment);
        }

        return [
            'payment' => $payment,
            'url' => (string) $payment->checkout_url,
            'expires_at' => $payment->checkout_expires_at,
            'test_mode' => $this->config->isTestMode(),
        ];
    }

    /**
     * Retrieves the session of the order's latest Stripe attempt straight from Stripe (never
     * from anything the browser sent).
     */
    public function latestSession(Order $order): ?Session
    {
        if (! $this->config->isConfigured()) {
            throw PaymentException::gatewayNotConfigured();
        }

        $sessionId = $order->payments()->where('method', PaymentMethod::Stripe->value)
            ->whereNotNull('provider_checkout_id')->reorder()->orderByDesc('id')->value('provider_checkout_id');

        if ($sessionId === null) {
            return null;
        }

        try {
            return $this->config->client()->checkout->sessions->retrieve($sessionId);
        } catch (ApiErrorException $e) {
            Log::error('Stripe session lookup failed.', ['order' => $order->order_number, 'error' => $e->getMessage()]);

            throw PaymentException::gatewayError();
        }
    }

    /**
     * Closes the order's open Checkout Sessions so a cancelled order can no longer be paid.
     * Best effort: if Stripe can't be reached, a late payment is still caught by the webhook
     * and flagged refund_required.
     */
    public function expireOpenSessions(Order $order): void
    {
        if (! $this->config->isConfigured()) {
            return;
        }

        $sessions = $order->payments()->where('method', PaymentMethod::Stripe->value)
            ->whereNotNull('provider_checkout_id')
            ->where('checkout_expires_at', '>', now())
            ->where('status', PaymentStatus::Cancelled->value)
            ->pluck('provider_checkout_id');

        foreach ($sessions as $sessionId) {
            try {
                $this->config->client()->checkout->sessions->expire($sessionId);
            } catch (ApiErrorException $e) {
                // Already completed or expired, or Stripe is unreachable.
                Log::info('Could not expire Stripe session.', ['order' => $order->order_number, 'session' => $sessionId, 'error' => $e->getMessage()]);
            }
        }
    }

    /**
     * Fixes the session's expiry on the payment row before calling Stripe, so a retry (or a
     * concurrent request) sends identical parameters under the same idempotency key and gets
     * the same session back instead of a second one.
     */
    private function planSession(Payment $payment): Payment
    {
        $minutes = $this->config->sessionMinutes();
        $planned = $payment->checkout_expires_at;

        // Stripe needs at least 30 minutes left when it creates the session.
        if ($planned === null || $planned->lt(now()->addMinutes($minutes)->addSeconds(30))) {
            $payment->update(['checkout_expires_at' => now()->addMinutes($minutes)->addMinute()->startOfSecond()]);
        }

        return $payment;
    }

    private function createSession(Order $order, Payment $payment): Payment
    {
        $order->loadMissing('items');
        $expiresAt = $payment->checkout_expires_at;
        $summary = $order->items->map(fn ($item) => "{$item->quantity} × {$item->product_name}")->implode(', ');
        $metadata = ['order_number' => $order->order_number, 'payment_reference' => $payment->reference];

        $params = [
            'mode' => 'payment',
            'client_reference_id' => $payment->reference,
            'customer_email' => $order->customer_email,
            'line_items' => [[
                'quantity' => 1,
                'price_data' => [
                    // Stripe takes the same integer minor units the API uses everywhere.
                    'currency' => strtolower($payment->currency),
                    'unit_amount' => $payment->amount,
                    'product_data' => [
                        'name' => config('restaurant.name').' order '.$order->order_number,
                        'description' => mb_substr($summary, 0, 500) ?: null,
                    ],
                ],
            ]],
            'metadata' => $metadata,
            'payment_intent_data' => [
                'description' => config('restaurant.name').' order '.$order->order_number,
                'metadata' => $metadata,
            ],
            'submit_type' => 'pay',
            'expires_at' => $expiresAt->getTimestamp(),
            'success_url' => $this->withOrder($this->config->successUrl(), $order),
            'cancel_url' => $this->withOrder($this->config->cancelUrl(), $order),
        ];
        if ($params['line_items'][0]['price_data']['product_data']['description'] === null) {
            unset($params['line_items'][0]['price_data']['product_data']['description']);
        }

        try {
            $session = $this->config->client()->checkout->sessions->create($params, [
                'idempotency_key' => "checkout-session:{$payment->reference}:{$expiresAt->getTimestamp()}",
            ]);
        } catch (ApiErrorException $e) {
            Log::error('Stripe Checkout Session could not be created.', [
                'order' => $order->order_number,
                'reference' => $payment->reference,
                'stripe_request_id' => $e->getRequestId(),
                'error' => $e->getMessage(),
            ]);

            throw PaymentException::gatewayError();
        }

        $payment->update([
            'provider_checkout_id' => $session->id,
            'checkout_url' => $session->url,
            'checkout_expires_at' => CarbonImmutable::createFromTimestamp($session->expires_at),
        ]);

        return $payment->refresh();
    }

    private function withOrder(string $url, Order $order): string
    {
        return $url.(str_contains($url, '?') ? '&' : '?').'order='.urlencode($order->order_number);
    }
}
