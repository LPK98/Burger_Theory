<?php

namespace App\Notifications;

use App\Models\Order;
use App\Support\Money;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** To the customer, once a payment is verified (PayHere) or recorded (cash). */
class PaymentReceived extends Notification implements ShouldQueue
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
        return (new MailMessage)
            ->subject("Payment received for order {$this->order->order_number}")
            ->line('We received '.Money::format($this->order->total, $this->order->currency)." for order {$this->order->order_number}. Thank you!");
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'payment_received',
            'order_number' => $this->order->order_number,
            'amount' => $this->order->total,
            'message' => "Payment received for order {$this->order->order_number}.",
        ];
    }
}
