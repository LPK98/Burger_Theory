<?php

namespace App\Services\Payment;

use App\Enums\PaymentStatus;
use App\Models\Order;
use App\Models\Payment;
use Illuminate\Support\Facades\Log;

/**
 * The payment state machine shared by the online gateways (PayHere and Stripe).
 *
 * Callers verify the gateway message first (signature, amount, currency), then call one of
 * these with the payment and order rows locked FOR UPDATE inside a transaction. Every method
 * is idempotent: applying the same message twice changes nothing the second time.
 *
 * Each returns [outcome, reason, whether the order just became paid].
 */
class PaymentSettlement
{
    /**
     * @param  array<string, mixed>  $provider  Gateway fields to store on the payment.
     * @return array{0: NotificationOutcome, 1: ?string, 2: bool}
     */
    public function succeed(Payment $payment, Order $order, array $provider, string $gateway): array
    {
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
            Log::warning("{$gateway} payment received that must be refunded.", ['order' => $order->order_number, 'reference' => $payment->reference]);

            return [NotificationOutcome::Processed, $alreadyPaidElsewhere ? 'refund_required_duplicate_payment' : 'refund_required_order_void', false];
        }

        $payment->update($provider + ['status' => PaymentStatus::Paid, 'paid_at' => now()]);
        $order->update(['payment_status' => PaymentStatus::Paid, 'paid_at' => now()]);

        return [NotificationOutcome::Processed, null, true];
    }

    /**
     * A still-pending payment that failed or was abandoned.
     *
     * @param  PaymentStatus::Failed|PaymentStatus::Cancelled  $target
     * @param  array<string, mixed>  $provider
     * @return array{0: NotificationOutcome, 1: ?string, 2: bool}
     */
    public function fail(Payment $payment, Order $order, PaymentStatus $target, array $provider): array
    {
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
    }

    /**
     * @param  array<string, mixed>  $provider
     * @return array{0: NotificationOutcome, 1: ?string, 2: bool}
     */
    public function chargeBack(Payment $payment, Order $order, array $provider, string $gateway): array
    {
        if ($payment->status === PaymentStatus::ChargedBack) {
            return [NotificationOutcome::Duplicate, null, false];
        }
        if ($payment->status !== PaymentStatus::Paid) {
            return [NotificationOutcome::Ignored, 'chargeback_on_unpaid', false];
        }
        $payment->update($provider + ['status' => PaymentStatus::ChargedBack]);
        $order->update(['payment_status' => PaymentStatus::ChargedBack]);
        Log::warning("{$gateway} chargeback received.", ['order' => $order->order_number]);

        return [NotificationOutcome::Processed, null, false];
    }
}
