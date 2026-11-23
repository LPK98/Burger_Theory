<?php

namespace App\Notifications;

use App\Models\Order;
use App\Support\Money;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** To administrators (and the optional ORDER_ALERT_EMAIL inbox) when an order comes in. */
class NewOrderReceived extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public Order $order)
    {
        $this->afterCommit();
    }

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return $notifiable instanceof AnonymousNotifiable ? ['mail'] : ['mail', 'database'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $order = $this->order;

        return (new MailMessage)
            ->subject("New order {$order->order_number} — ".Money::format($order->total, $order->currency))
            ->line("{$order->customer_name} placed order {$order->order_number}.")
            ->line('Fulfilment: '.$order->fulfilment_type->value.' · Payment: '.$order->payment_method->label())
            ->line('Total: '.Money::format($order->total, $order->currency));
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'new_order',
            'order_number' => $this->order->order_number,
            'customer_name' => $this->order->customer_name,
            'payment_method' => $this->order->payment_method->value,
            'total' => $this->order->total,
            'message' => "New order {$this->order->order_number} from {$this->order->customer_name}.",
        ];
    }
}
