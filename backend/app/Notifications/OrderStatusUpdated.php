<?php

namespace App\Notifications;

use App\Enums\OrderStatus;
use App\Models\Order;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** To the customer, whenever their order moves to a new status. */
class OrderStatusUpdated extends Notification implements ShouldQueue
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
        $order = $this->order;
        $mail = (new MailMessage)
            ->subject("Order {$order->order_number}: {$order->status->label()}")
            ->line($this->sentence());

        if ($order->status->isVoid() && $order->cancellation_reason) {
            $mail->line("Reason: {$order->cancellation_reason}");
        }

        return $mail;
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'order_status',
            'order_number' => $this->order->order_number,
            'status' => $this->order->status->value,
            'message' => $this->sentence(),
        ];
    }

    private function sentence(): string
    {
        $n = $this->order->order_number;

        return match ($this->order->status) {
            OrderStatus::Confirmed => "Order {$n} is confirmed.",
            OrderStatus::Preparing => "The kitchen is preparing order {$n}.",
            OrderStatus::Ready => "Order {$n} is ready.",
            OrderStatus::OutForDelivery => "Order {$n} is on its way.",
            OrderStatus::Delivered => "Order {$n} has been delivered. Enjoy!",
            OrderStatus::Cancelled => "Order {$n} was cancelled.",
            OrderStatus::Rejected => "Sorry, we could not accept order {$n}.",
            OrderStatus::Pending => "Order {$n} is pending.",
        };
    }
}
