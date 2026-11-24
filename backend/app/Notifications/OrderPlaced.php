<?php

namespace App\Notifications;

use App\Models\Order;
use App\Support\Money;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** To the customer, when their order is placed. */
class OrderPlaced extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public Order $order)
    {
        $this->afterCommit();
    }

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['mail', 'database'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $order = $this->order->loadMissing('items');
        $mail = (new MailMessage)
            ->subject("Order {$order->order_number} received")
            ->greeting("Thanks, {$order->customer_name}!")
            ->line("We have received order {$order->order_number}.");

        foreach ($order->items as $item) {
            $mail->line("{$item->quantity} × {$item->product_name} — ".Money::format($item->line_total, $order->currency));
        }

        $mail->line('Total: '.Money::format($order->total, $order->currency));

        return $order->payment_method->isOnline()
            ? $mail->line('Your order goes to the kitchen as soon as your online payment is confirmed.')
            : $mail->line('Please have the cash ready when your order arrives.');
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'order_placed',
            'order_number' => $this->order->order_number,
            'status' => $this->order->status->value,
            'total' => $this->order->total,
            'message' => "Order {$this->order->order_number} received.",
        ];
    }
}
