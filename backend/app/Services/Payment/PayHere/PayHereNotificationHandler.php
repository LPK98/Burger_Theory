<?php

namespace App\Services\Payment\PayHere;

use App\Enums\PaymentMethod;
use App\Enums\PaymentStatus;
use App\Models\Order;
use App\Models\Payment;
use App\Models\PaymentEvent;
use App\Services\Order\OrderNotifier;
use App\Support\Money;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use InvalidArgumentException;

/**
 * Handles PayHere's server-to-server notification (POST notify_url, form-encoded).
 *
 * Order of checks: required fields → md5sig (constant-time compare) → merchant id →
 * known payment reference → amount and currency match what we asked for. Only then,
 * with the payment and order rows locked, is the status applied. Re-sent notifications
 * are recognised and change nothing, so processing is idempotent.
 */
class PayHereNotificationHandler
{
    public const STATUS_SUCCESS = 2;

    public const STATUS_PENDING = 0;

    public const STATUS_CANCELLED = -1;

    public const STATUS_FAILED = -2;

    public const STATUS_CHARGEDBACK = -3;

    private const REQUIRED = ['merchant_id', 'order_id', 'payhere_amount', 'payhere_currency', 'status_code', 'md5sig'];

    /** Stored in payment_events. Card holder name and expiry are deliberately dropped. */
    private const LOGGED = [
        'merchant_id', 'order_id', 'payment_id', 'payhere_amount', 'payhere_currency', 'status_code',
        'status_message', 'method', 'card_no', 'custom_1', 'custom_2', 'md5sig',
    ];

    public function __construct(
        private readonly PayHereConfig $config,
        private readonly OrderNotifier $notifier,
    ) {}

    /**
     * @param  array<string, mixed>  $input  Raw POST body.
     * @return array{outcome: NotificationOutcome, reason: ?string, payment: ?Payment}
     */
    public function handle(array $input, ?string $ip = null): array
    {
        $payload = [];
        foreach (self::LOGGED as $key) {
            if (isset($input[$key]) && is_scalar($input[$key])) {
                $payload[$key] = trim((string) $input[$key]);
            }
        }

        foreach (self::REQUIRED as $key) {
            if (($payload[$key] ?? '') === '') {
                return $this->finish(NotificationOutcome::Rejected, "missing_{$key}", $payload, $ip, false, null);
            }
        }

        if (! $this->config->isConfigured() || ! PayHereSignature::verifyNotification($payload, $this->config->merchantSecret())) {
            Log::warning('PayHere notification with an invalid signature.', ['reference' => $payload['order_id'], 'ip' => $ip]);

            return $this->finish(NotificationOutcome::Rejected, 'invalid_signature', $payload, $ip, false, null);
        }

        if (! hash_equals($this->config->merchantId(), $payload['merchant_id'])) {
            return $this->finish(NotificationOutcome::Rejected, 'merchant_mismatch', $payload, $ip, true, null);
        }

        $payment = Payment::query()
            ->where('reference', $payload['order_id'])
            ->where('method', PaymentMethod::PayHere->value)
            ->first();
        if ($payment === null) {
            return $this->finish(NotificationOutcome::Rejected, 'unknown_reference', $payload, $ip, true, null);
        }

        try {
            $paidAmount = Money::toMinor($payload['payhere_amount']);
        } catch (InvalidArgumentException) {
            $paidAmount = null;
        }
        if ($paidAmount !== $payment->amount || $payload['payhere_currency'] !== $payment->currency) {
            Log::error('PayHere notification amount/currency mismatch.', [
                'reference' => $payment->reference,
                'expected' => Money::toDecimal($payment->amount).' '.$payment->currency,
                'received' => $payload['payhere_amount'].' '.$payload['payhere_currency'],
            ]);

            return $this->finish(NotificationOutcome::Rejected, 'amount_mismatch', $payload, $ip, true, $payment);
        }

        if (! preg_match('/^-?\d+$/', $payload['status_code'])) {
            return $this->finish(NotificationOutcome::Rejected, 'invalid_status_code', $payload, $ip, true, $payment);
        }

        // A PayHere payment id belongs to exactly one of our payment attempts.
        $paymentId = $payload['payment_id'] ?? null;
        if ($paymentId !== null && Payment::query()
            ->where('method', PaymentMethod::PayHere->value)
            ->where('provider_payment_id', $paymentId)
            ->whereKeyNot($payment->id)
            ->exists()) {
            Log::error('PayHere payment_id already recorded on another payment.', ['reference' => $payment->reference, 'payment_id' => $paymentId]);

            return $this->finish(NotificationOutcome::Rejected, 'payment_id_conflict', $payload, $ip, true, $payment);
        }

        [$outcome, $reason, $becamePaid] = DB::transaction(function () use ($payment, $payload) {
            $payment = Payment::query()->whereKey($payment->id)->lockForUpdate()->firstOrFail();
            $order = Order::query()->whereKey($payment->order_id)->lockForUpdate()->firstOrFail();

            return $this->apply($payment, $order, (int) $payload['status_code'], $payload);
        });

        $result = $this->finish($outcome, $reason, $payload, $ip, true, $payment->refresh());

        if ($becamePaid) {
            $this->notifier->paymentReceived($payment->order);
        }

        return $result;
    }

    /**
     * @param  array<string, string>  $payload
     * @return array{0: NotificationOutcome, 1: ?string, 2: bool} outcome, reason, whether the order became paid
     */
    private function apply(Payment $payment, Order $order, int $statusCode, array $payload): array
    {
        $provider = [
            'provider_payment_id' => $payload['payment_id'] ?? $payment->provider_payment_id,
            'provider_status_code' => $statusCode,
            'provider_status_message' => isset($payload['status_message']) ? mb_substr($payload['status_message'], 0, 255) : null,
            'provider_method' => isset($payload['method']) ? mb_substr($payload['method'], 0, 30) : null,
            'card_mask' => $this->cardMask($payload['card_no'] ?? null),
        ];

        switch ($statusCode) {
            case self::STATUS_SUCCESS:
                if (in_array($payment->status, [PaymentStatus::Paid, PaymentStatus::RefundRequired, PaymentStatus::ChargedBack], true)) {
                    return [NotificationOutcome::Duplicate, 'already_paid', false];
                }

                $alreadyPaidElsewhere = $order->payment_status === PaymentStatus::Paid
                    || $order->payments()->where('status', PaymentStatus::Paid->value)->whereKeyNot($payment->id)->exists();

                if ($order->status->isVoid() || $alreadyPaidElsewhere) {
                    // Money arrived for an order we will not fulfil (or have been paid for twice).
                    $payment->update($provider + ['status' => PaymentStatus::RefundRequired, 'paid_at' => now()]);
                    if (! $alreadyPaidElsewhere) {
                        $order->update(['payment_status' => PaymentStatus::RefundRequired]);
                    }
                    Log::warning('PayHere payment received that must be refunded.', ['order' => $order->order_number, 'reference' => $payment->reference]);

                    return [NotificationOutcome::Processed, $alreadyPaidElsewhere ? 'refund_required_duplicate_payment' : 'refund_required_order_void', false];
                }

                $payment->update($provider + ['status' => PaymentStatus::Paid, 'paid_at' => now()]);
                $order->update(['payment_status' => PaymentStatus::Paid, 'paid_at' => now()]);

                return [NotificationOutcome::Processed, null, true];

            case self::STATUS_PENDING:
                if ($payment->status !== PaymentStatus::Pending) {
                    return [NotificationOutcome::Ignored, 'stale_pending', false];
                }
                $payment->update($provider);

                return [NotificationOutcome::Processed, null, false];

            case self::STATUS_CANCELLED:
            case self::STATUS_FAILED:
                $target = $statusCode === self::STATUS_FAILED ? PaymentStatus::Failed : PaymentStatus::Cancelled;
                if ($payment->status === $target) {
                    return [NotificationOutcome::Duplicate, null, false];
                }
                if ($payment->status !== PaymentStatus::Pending) {
                    return [NotificationOutcome::Ignored, 'stale_'.$target->value, false];
                }
                $payment->update($provider + ['status' => $target]);
                if ($order->payment_status === PaymentStatus::Pending) {
                    $order->update(['payment_status' => $target]);
                }

                return [NotificationOutcome::Processed, null, false];

            case self::STATUS_CHARGEDBACK:
                if ($payment->status === PaymentStatus::ChargedBack) {
                    return [NotificationOutcome::Duplicate, null, false];
                }
                if ($payment->status !== PaymentStatus::Paid) {
                    return [NotificationOutcome::Ignored, 'chargeback_on_unpaid', false];
                }
                $payment->update($provider + ['status' => PaymentStatus::ChargedBack]);
                $order->update(['payment_status' => PaymentStatus::ChargedBack]);
                Log::warning('PayHere chargeback received.', ['order' => $order->order_number]);

                return [NotificationOutcome::Processed, null, false];

            default:
                return [NotificationOutcome::Ignored, 'unknown_status_code', false];
        }
    }

    /**
     * @param  array<string, string>  $payload
     * @return array{outcome: NotificationOutcome, reason: ?string, payment: ?Payment}
     */
    private function finish(NotificationOutcome $outcome, ?string $reason, array $payload, ?string $ip, bool $signatureValid, ?Payment $payment): array
    {
        if (isset($payload['card_no'])) {
            $payload['card_no'] = $this->cardMask($payload['card_no']);
        }

        PaymentEvent::query()->create([
            'payment_id' => $payment?->id,
            'provider' => PaymentMethod::PayHere->value,
            'reference' => isset($payload['order_id']) ? mb_substr($payload['order_id'], 0, 60) : null,
            'provider_status_code' => isset($payload['status_code']) && preg_match('/^-?\d{1,4}$/', $payload['status_code']) ? (int) $payload['status_code'] : null,
            'signature_valid' => $signatureValid,
            'outcome' => $outcome->value,
            'outcome_reason' => $reason,
            'payload' => $payload,
            'ip_address' => $ip,
        ]);

        return ['outcome' => $outcome, 'reason' => $reason, 'payment' => $payment];
    }

    /** Keeps only a masked card number (PayHere already masks it; this is defence in depth). */
    private function cardMask(?string $cardNo): ?string
    {
        if ($cardNo === null || $cardNo === '') {
            return null;
        }
        $digits = preg_replace('/\D/', '', $cardNo) ?? '';

        return $digits === '' ? null : '************'.substr($digits, -4);
    }
}
