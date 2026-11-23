<?php

namespace App\Exceptions;

class PaymentException extends ApiException
{
    public static function gatewayNotConfigured(): self
    {
        return new self('Online payment is not configured.', 'payment_gateway_not_configured', 503);
    }

    public static function notPayable(string $reason): self
    {
        return new self($reason, 'order_not_payable', 409);
    }

    public static function notCashOnDelivery(): self
    {
        return new self('This order is not a cash-on-delivery order.', 'not_cash_on_delivery', 409);
    }

    public static function alreadySettled(): self
    {
        return new self('The payment for this order has already been recorded.', 'payment_already_settled', 409);
    }

    public static function cashNotCollectableYet(): self
    {
        return new self('Cash can only be recorded once the order is ready, out for delivery or delivered.', 'cash_not_collectable', 409);
    }
}
