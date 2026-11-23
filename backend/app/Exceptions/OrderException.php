<?php

namespace App\Exceptions;

use App\Enums\FulfilmentType;
use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use App\Support\Money;

class OrderException extends ApiException
{
    public static function notAcceptingOrders(): self
    {
        return new self('We are not accepting online orders right now.', 'not_accepting_orders', 503);
    }

    public static function fulfilmentUnavailable(FulfilmentType $type): self
    {
        return new self(ucfirst($type->value).' is not available right now.', 'fulfilment_unavailable');
    }

    public static function paymentMethodUnavailable(PaymentMethod $method): self
    {
        return new self($method->label().' is not available right now.', 'payment_method_unavailable');
    }

    public static function belowMinimum(int $minimum): self
    {
        return new self(
            'The minimum order is '.Money::format($minimum).'.',
            'below_minimum_order',
            422,
            ['minimum_order_amount' => $minimum],
        );
    }

    /**
     * @param  list<OrderStatus>  $allowed
     */
    public static function invalidTransition(OrderStatus $from, OrderStatus $to, array $allowed): self
    {
        return new self(
            "An order that is {$from->label()} cannot be moved to {$to->label()}.",
            'invalid_status_transition',
            409,
            ['from' => $from->value, 'to' => $to->value, 'allowed' => array_map(fn (OrderStatus $s) => $s->value, $allowed)],
        );
    }

    public static function notCancellable(): self
    {
        return new self('This order can no longer be cancelled online. Please call the restaurant.', 'order_not_cancellable', 409);
    }

    public static function paymentRequired(): self
    {
        return new self('This order cannot be confirmed until its online payment has been received.', 'payment_required', 409);
    }

    public static function onlinePaymentNeedsAmount(): self
    {
        return new self('Nothing to pay online for this order. Choose cash on delivery instead.', 'nothing_to_pay');
    }
}
