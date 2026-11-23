<?php

namespace App\Services\Payment;

use App\Enums\PaymentMethod;
use App\Enums\PaymentStatus;
use App\Exceptions\PaymentException;
use App\Models\Order;
use App\Models\Payment;
use App\Models\User;
use App\Services\Order\OrderNotifier;
use Illuminate\Support\Facades\DB;

/**
 * Cash on delivery: the order is created with a pending payment, and only an
 * administrator can record that the cash was collected. There is no customer-facing
 * endpoint that changes a COD payment.
 */
class CashOnDeliveryService
{
    public function __construct(private readonly OrderNotifier $notifier) {}

    public function markCollected(Order $order, User $admin): Payment
    {
        $payment = DB::transaction(function () use ($order, $admin) {
            $locked = Order::query()->whereKey($order->id)->lockForUpdate()->firstOrFail();

            if ($locked->payment_method !== PaymentMethod::CashOnDelivery) {
                throw PaymentException::notCashOnDelivery();
            }
            if ($locked->payment_status === PaymentStatus::Paid) {
                throw PaymentException::alreadySettled();
            }
            if ($locked->status->isVoid()) {
                throw PaymentException::notPayable('This order was cancelled or rejected.');
            }
            if (! $locked->status->allowsCashCollection()) {
                throw PaymentException::cashNotCollectableYet();
            }

            $payment = Payment::query()
                ->where('order_id', $locked->id)
                ->where('method', PaymentMethod::CashOnDelivery->value)
                ->where('status', PaymentStatus::Pending->value)
                ->lockForUpdate()
                ->first();

            if ($payment === null) {
                throw PaymentException::alreadySettled();
            }

            $payment->update([
                'status' => PaymentStatus::Paid,
                'collected_by_id' => $admin->id,
                'collected_at' => now(),
                'paid_at' => now(),
            ]);
            $locked->update(['payment_status' => PaymentStatus::Paid, 'paid_at' => now()]);

            return $payment;
        });

        $this->notifier->paymentReceived($order->refresh());

        return $payment;
    }
}
