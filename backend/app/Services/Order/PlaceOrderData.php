<?php

namespace App\Services\Order;

use App\Enums\FulfilmentType;
use App\Enums\PaymentMethod;

/** Validated checkout input. Note what is absent: prices, totals and line items come from the server-side cart. */
final readonly class PlaceOrderData
{
    /**
     * @param  array{recipient_name: string, phone: string, line1: string, line2?: ?string, city: string, postal_code?: ?string, delivery_instructions?: ?string}|null  $address
     */
    public function __construct(
        public FulfilmentType $fulfilment,
        public PaymentMethod $paymentMethod,
        public ?int $addressId = null,
        public ?array $address = null,
        public bool $saveAddress = false,
        public ?string $contactPhone = null,
        public ?string $notes = null,
        public ?string $idempotencyKey = null,
    ) {}
}
