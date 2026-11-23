<?php

namespace App\Services\Cart;

use App\Enums\FulfilmentType;
use App\Models\Coupon;

/** Server-side price breakdown for a cart. All amounts are minor units. */
final readonly class Quote
{
    /**
     * @param  list<QuoteLine>  $lines
     * @param  list<array{code: string, message: string, product_id?: int}>  $issues  Reasons checkout is blocked.
     */
    public function __construct(
        public array $lines,
        public int $subtotal,
        public int $discount,
        public int $deliveryFee,
        public int $total,
        public FulfilmentType $fulfilment,
        public ?Coupon $coupon,
        public ?array $couponError,
        public array $issues,
        public int $minimumOrderAmount,
        public ?int $freeDeliveryThreshold,
        public string $currency,
    ) {}

    public function itemCount(): int
    {
        return array_sum(array_map(fn (QuoteLine $line) => $line->quantity, $this->lines));
    }

    public function canCheckout(): bool
    {
        return $this->lines !== [] && $this->issues === [];
    }
}
