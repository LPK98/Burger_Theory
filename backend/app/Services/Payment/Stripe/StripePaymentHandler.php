<?php

namespace App\Services\Payment\Stripe;

use App\Enums\PaymentMethod;
use App\Enums\PaymentStatus;
use App\Models\Order;
use App\Models\Payment;
use App\Models\PaymentEvent;
use App\Services\Order\OrderNotifier;
use App\Services\Payment\NotificationOutcome;
use App\Services\Payment\PaymentSettlement;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Stripe\Checkout\Session;
use Stripe\Event;
use Stripe\Exception\ApiErrorException;
use Stripe\Exception\SignatureVerificationException;
use Stripe\StripeObject;
use Stripe\Webhook;
use UnexpectedValueException;

/**
 * Applies Stripe's view of a payment to our payment and order rows.
 *
 * Two ways in, one code path (Stripe's recommended "fulfil from both places" pattern):
 *  - handleWebhook(): a webhook whose Stripe-Signature verifies against STRIPE_WEBHOOK_SECRET;
 *  - applySession(): a Checkout Session this server just retrieved from Stripe's API, used when
 *    the shopper lands back on the storefront, so the order updates even before the webhook.
 *
 * A session only ever settles the payment that created it (matched on the stored session
 * id), and only if Stripe's amount and currency equal what we asked for. Every message is
 * logged in payment_events; re-deliveries change nothing.
 */
class StripePaymentHandler
{
    public const HANDLED_EVENTS = [
        'checkout.session.completed',
        'checkout.session.async_payment_succeeded',
        'checkout.session.async_payment_failed',
        'checkout.session.expired',
        'charge.dispute.created',
    ];

    public function __construct(
        private readonly StripeConfig $config,
        private readonly OrderNotifier $notifier,
        private readonly PaymentSettlement $settlement,
    ) {}

    /**
     * @return array{outcome: NotificationOutcome, reason: ?string, payment: ?Payment}
     */
    public function handleWebhook(string $body, ?string $signature, ?string $ip = null): array
    {
        if (! $this->config->webhookConfigured()) {
            Log::error('Stripe webhook received but STRIPE_WEBHOOK_SECRET is not set.');

            return ['outcome' => NotificationOutcome::Rejected, 'reason' => 'webhook_not_configured', 'payment' => null];
        }

        try {
            $event = Webhook::constructEvent($body, (string) $signature, $this->config->webhookSecret());
        } catch (SignatureVerificationException|UnexpectedValueException) {
            Log::warning('Stripe webhook with an invalid signature.', ['ip' => $ip]);

            return $this->log(NotificationOutcome::Rejected, 'invalid_signature', ['source' => 'webhook'], $ip, false, null, null);
        }

        $summary = ['source' => 'webhook', 'event_id' => $event->id, 'type' => $event->type, 'livemode' => (bool) $event->livemode];

        // Stripe may deliver an event more than once.
        $seen = PaymentEvent::query()->where('provider', PaymentMethod::Stripe->value)
            ->where('provider_event_id', $event->id)
            ->whereIn('outcome', [NotificationOutcome::Processed->value, NotificationOutcome::Duplicate->value, NotificationOutcome::Ignored->value])
            ->first();
        if ($seen !== null) {
            return ['outcome' => NotificationOutcome::Duplicate, 'reason' => 'event_already_handled', 'payment' => $seen->payment];
        }

        if (str_starts_with($event->type, 'checkout.session.')) {
            return $this->applySession($event->data->object, $event, $ip);
        }

        if ($event->type === 'charge.dispute.created') {
            return $this->applyDispute($event->data->object, $event, $summary, $ip);
        }

        return $this->log(NotificationOutcome::Ignored, 'unhandled_event_type', $summary, $ip, true, null, $event->id);
    }

    /**
     * @return array{outcome: NotificationOutcome, reason: ?string, payment: ?Payment}
     */
    public function applySession(Session|StripeObject $session, ?Event $event = null, ?string $ip = null): array
    {
        $paymentIntentId = $this->id($session->payment_intent ?? null);
        $summary = array_filter([
            'source' => $event === null ? 'return' : 'webhook',
            'event_id' => $event?->id,
            'type' => $event?->type,
            'livemode' => $event === null ? null : (bool) $event->livemode,
            'session_id' => $session->id ?? null,
            'session_status' => $session->status ?? null,
            'payment_status' => $session->payment_status ?? null,
            'payment_intent' => $paymentIntentId,
            'amount_total' => $session->amount_total ?? null,
            'currency' => $session->currency ?? null,
            'client_reference_id' => $session->client_reference_id ?? null,
        ], fn ($v) => $v !== null);

        $payment = Payment::query()->where('method', PaymentMethod::Stripe->value)
            ->where('provider_checkout_id', (string) ($session->id ?? ''))
            ->first();
        if ($payment === null) {
            // Not a session this server created (another app on the same Stripe account?).
            return $this->log(NotificationOutcome::Ignored, 'unknown_session', $summary, $ip, true, null, $event?->id);
        }

        if ((int) ($session->amount_total ?? -1) !== $payment->amount || strtoupper((string) ($session->currency ?? '')) !== $payment->currency) {
            Log::error('Stripe session amount/currency mismatch.', [
                'reference' => $payment->reference,
                'expected' => $payment->amount.' '.$payment->currency,
                'received' => ($session->amount_total ?? 'null').' '.($session->currency ?? 'null'),
            ]);

            return $this->log(NotificationOutcome::Rejected, 'amount_mismatch', $summary, $ip, true, $payment, $event?->id);
        }

        if ($paymentIntentId !== null && Payment::query()
            ->where('method', PaymentMethod::Stripe->value)
            ->where('provider_payment_id', $paymentIntentId)
            ->whereKeyNot($payment->id)
            ->exists()) {
            Log::error('Stripe PaymentIntent already recorded on another payment.', ['reference' => $payment->reference, 'payment_intent' => $paymentIntentId]);

            return $this->log(NotificationOutcome::Rejected, 'payment_intent_conflict', $summary, $ip, true, $payment, $event?->id);
        }

        $paid = ($session->status ?? null) === 'complete' && ($session->payment_status ?? null) === 'paid';
        $provider = array_filter([
            'provider_payment_id' => $paymentIntentId,
            'provider_status_message' => $session->payment_status ?? null,
        ], fn ($v) => $v !== null);
        if ($paid && $paymentIntentId !== null) {
            $provider += $this->cardDetails($paymentIntentId);
        }

        [$outcome, $reason, $becamePaid] = DB::transaction(function () use ($payment, $session, $event, $paid, $provider) {
            $payment = Payment::query()->whereKey($payment->id)->lockForUpdate()->firstOrFail();
            $order = Order::query()->whereKey($payment->order_id)->lockForUpdate()->firstOrFail();

            if ($paid) {
                return $this->settlement->succeed($payment, $order, $provider, 'Stripe');
            }
            if ($event?->type === 'checkout.session.async_payment_failed') {
                return $this->settlement->fail($payment, $order, PaymentStatus::Failed, $provider);
            }
            if (($session->status ?? null) === 'expired') {
                return $this->settlement->fail($payment, $order, PaymentStatus::Cancelled, $provider + ['provider_status_message' => 'expired']);
            }
            if (($session->status ?? null) === 'complete') {
                // Completed with a delayed payment method (e.g. a bank debit): wait for
                // checkout.session.async_payment_succeeded / _failed.
                if ($payment->status !== PaymentStatus::Pending) {
                    return [NotificationOutcome::Ignored, 'stale_pending', false];
                }
                $payment->update($provider);

                return [NotificationOutcome::Processed, 'awaiting_async_payment', false];
            }

            return [NotificationOutcome::Ignored, 'session_open', false];
        });

        $result = $this->log($outcome, $reason, $summary, $ip, true, $payment->refresh(), $event?->id);

        if ($becamePaid) {
            $this->notifier->paymentReceived($payment->order);
        }

        return $result;
    }

    /**
     * @param  array<string, mixed>  $summary
     * @return array{outcome: NotificationOutcome, reason: ?string, payment: ?Payment}
     */
    private function applyDispute(StripeObject $dispute, Event $event, array $summary, ?string $ip): array
    {
        $paymentIntentId = $this->id($dispute->payment_intent ?? null);
        $summary += array_filter(['dispute_id' => $dispute->id ?? null, 'payment_intent' => $paymentIntentId, 'reason' => $dispute->reason ?? null]);

        $payment = $paymentIntentId === null ? null : Payment::query()
            ->where('method', PaymentMethod::Stripe->value)
            ->where('provider_payment_id', $paymentIntentId)
            ->first();
        if ($payment === null) {
            return $this->log(NotificationOutcome::Ignored, 'unknown_payment_intent', $summary, $ip, true, null, $event->id);
        }

        [$outcome, $reason] = DB::transaction(function () use ($payment) {
            $payment = Payment::query()->whereKey($payment->id)->lockForUpdate()->firstOrFail();
            $order = Order::query()->whereKey($payment->order_id)->lockForUpdate()->firstOrFail();

            return $this->settlement->chargeBack($payment, $order, ['provider_status_message' => 'disputed'], 'Stripe');
        });

        return $this->log($outcome, $reason, $summary, $ip, true, $payment->refresh(), $event->id);
    }

    /**
     * Card brand and last four digits, for the admin portal and the receipt. Optional: a
     * failure here never blocks marking the order as paid.
     *
     * @return array{provider_method?: string, card_mask?: string}
     */
    private function cardDetails(string $paymentIntentId): array
    {
        try {
            $intent = $this->config->client()->paymentIntents->retrieve($paymentIntentId, ['expand' => ['latest_charge']]);
            $details = $intent->latest_charge->payment_method_details ?? null;
        } catch (ApiErrorException $e) {
            Log::info('Could not read Stripe card details.', ['payment_intent' => $paymentIntentId, 'error' => $e->getMessage()]);

            return [];
        }

        if ($details === null) {
            return [];
        }

        $card = $details->card ?? null;
        $last4 = $card?->last4 ?? null;

        return array_filter([
            'provider_method' => mb_substr((string) ($card?->brand ?? $details->type ?? ''), 0, 30) ?: null,
            'card_mask' => is_string($last4) && preg_match('/^\d{4}$/', $last4) ? '************'.$last4 : null,
        ]);
    }

    private function id(mixed $value): ?string
    {
        if (is_string($value) && $value !== '') {
            return $value;
        }
        if ($value instanceof StripeObject && isset($value->id)) {
            return (string) $value->id;
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $summary  What is stored; never the raw body.
     * @return array{outcome: NotificationOutcome, reason: ?string, payment: ?Payment}
     */
    private function log(NotificationOutcome $outcome, ?string $reason, array $summary, ?string $ip, bool $signatureValid, ?Payment $payment, ?string $eventId): array
    {
        PaymentEvent::query()->create([
            'payment_id' => $payment?->id,
            'provider' => PaymentMethod::Stripe->value,
            'provider_event_id' => $eventId,
            'reference' => $payment?->reference,
            'provider_status_code' => null,
            'signature_valid' => $signatureValid,
            'outcome' => $outcome->value,
            'outcome_reason' => $reason,
            'payload' => $summary,
            'ip_address' => $ip,
        ]);

        return ['outcome' => $outcome, 'reason' => $reason, 'payment' => $payment];
    }
}
