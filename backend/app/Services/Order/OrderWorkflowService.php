<?php

namespace App\Services\Order;

use App\Enums\OrderActor;
use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use App\Enums\PaymentStatus;
use App\Exceptions\OrderException;
use App\Models\Order;
use App\Models\User;
use App\Services\Coupon\CouponService;
use App\Services\Product\InventoryService;
use App\Services\Settings\RestaurantSettings;
use Closure;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/** Moves orders through their lifecycle (see App\Enums\OrderStatus) with the side effects each step needs. */
class OrderWorkflowService
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly CouponService $coupons,
        private readonly OrderNotifier $notifier,
        private readonly RestaurantSettings $settings,
    ) {}

    /**
     * @param  (Closure(Order): void)|null  $guard  Extra check run against the locked order.
     */
    public function transition(Order $order, OrderStatus $to, OrderActor $actor, ?User $by = null, ?string $note = null, ?Closure $guard = null): Order
    {
        $updated = DB::transaction(function () use ($order, $to, $actor, $by, $note, $guard) {
            $locked = Order::query()->whereKey($order->id)->lockForUpdate()->firstOrFail();
            $from = $locked->status;

            if ($guard !== null) {
                $guard($locked);
            }

            if (! $from->canTransitionTo($to, $locked->fulfilment_type)) {
                throw OrderException::invalidTransition($from, $to, $from->nextStatuses($locked->fulfilment_type));
            }

            // Food is not prepared for an online order that has not been paid.
            if ($to === OrderStatus::Confirmed && $locked->payment_method === PaymentMethod::PayHere && $locked->payment_status !== PaymentStatus::Paid) {
                throw OrderException::paymentRequired();
            }

            $locked->status = $to;
            match ($to) {
                OrderStatus::Confirmed => $locked->estimated_ready_at = now()->addMinutes($this->settings->preparationMinutes()),
                OrderStatus::Delivered => $locked->delivered_at = now(),
                OrderStatus::Cancelled, OrderStatus::Rejected => $locked->fill([
                    'cancelled_at' => now(),
                    'cancelled_by' => $actor,
                    'cancellation_reason' => $note,
                ]),
                default => null,
            };
            $locked->save();

            if ($to->isVoid()) {
                $this->void($locked, $by);
            }

            $locked->statusHistory()->create([
                'from_status' => $from,
                'to_status' => $to,
                'actor_type' => $actor,
                'changed_by_id' => $by?->id,
                'note' => $note,
            ]);

            return $locked;
        });

        $this->notifier->statusChanged($updated);

        return $updated;
    }

    public function cancelByCustomer(Order $order, User $customer, ?string $reason): Order
    {
        return $this->transition(
            $order,
            OrderStatus::Cancelled,
            OrderActor::Customer,
            $customer,
            $reason ?: 'Cancelled by customer',
            function (Order $locked) {
                if (! $locked->isCancellableByCustomer()) {
                    throw OrderException::notCancellable();
                }
            },
        );
    }

    /**
     * Cancels online-payment orders whose payment never completed, releasing their stock.
     *
     * @return int Number of orders cancelled.
     */
    public function expireUnpaidOnlineOrders(int $olderThanMinutes): int
    {
        $cancelled = 0;

        Order::query()
            ->where('payment_method', PaymentMethod::PayHere->value)
            ->where('status', OrderStatus::Pending->value)
            ->where('payment_status', '!=', PaymentStatus::Paid->value)
            ->where('created_at', '<', now()->subMinutes($olderThanMinutes))
            ->lazyById(100)
            ->each(function (Order $order) use (&$cancelled, $olderThanMinutes) {
                try {
                    $this->transition($order, OrderStatus::Cancelled, OrderActor::System, null,
                        "Online payment was not completed within {$olderThanMinutes} minutes.",
                        function (Order $locked) {
                            if (! $locked->isAwaitingOnlinePayment()) {
                                throw OrderException::notCancellable();
                            }
                        });
                    $cancelled++;
                } catch (OrderException) {
                    // Paid or changed in the meantime; leave it alone.
                }
            });

        return $cancelled;
    }

    /** Side effects of cancelling or rejecting: stock, coupon, and payments. */
    private function void(Order $order, ?User $by): void
    {
        $this->inventory->releaseForOrder($order, $by);
        $this->coupons->releaseUsage($order);

        $order->payments()->where('status', PaymentStatus::Pending->value)->update(['status' => PaymentStatus::Cancelled->value]);

        $paid = $order->payments()->where('status', PaymentStatus::Paid->value)->exists();
        if ($paid) {
            // Refunds are issued from the PayHere merchant portal; flag the order so staff see it.
            $order->payments()->where('status', PaymentStatus::Paid->value)->update(['status' => PaymentStatus::RefundRequired->value]);
            $order->update(['payment_status' => PaymentStatus::RefundRequired]);
            Log::warning('Paid order voided; refund required.', ['order' => $order->order_number]);
        } elseif ($order->payment_status !== PaymentStatus::RefundRequired) {
            $order->update(['payment_status' => PaymentStatus::Cancelled]);
        }
    }
}
