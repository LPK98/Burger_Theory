<?php

namespace App\Services\Order;

use App\Enums\UserRole;
use App\Models\Order;
use App\Models\User;
use App\Notifications\NewOrderReceived;
use App\Notifications\OrderPlaced;
use App\Notifications\OrderStatusUpdated;
use App\Notifications\PaymentReceived;
use Illuminate\Support\Facades\Notification;

/** Sends order notifications. Every notification is queued and dispatched after commit. */
class OrderNotifier
{
    public function orderPlaced(Order $order): void
    {
        $order->user?->notify(new OrderPlaced($order));

        $admins = User::query()->where('role', UserRole::Admin->value)->get();
        if ($admins->isNotEmpty()) {
            Notification::send($admins, new NewOrderReceived($order));
        }

        if ($inbox = config('restaurant.order_alert_email')) {
            Notification::route('mail', $inbox)->notify(new NewOrderReceived($order));
        }
    }

    public function statusChanged(Order $order): void
    {
        $order->user?->notify(new OrderStatusUpdated($order));
    }

    public function paymentReceived(Order $order): void
    {
        $order->user?->notify(new PaymentReceived($order));
    }
}
