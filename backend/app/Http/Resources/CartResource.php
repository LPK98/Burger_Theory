<?php

namespace App\Http\Resources;

use App\Models\Cart;
use App\Services\Cart\Quote;
use App\Services\Cart\QuoteLine;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The cart with server-calculated totals (integer cents). `token` is only present for
 * guest carts: send it back as the X-Cart-Token header.
 */
class CartResource extends JsonResource
{
    public function __construct(private readonly Cart $cart, private readonly Quote $quote)
    {
        parent::__construct($cart);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $quote = $this->quote;

        return [
            'token' => $this->cart->user_id === null ? $this->cart->token : null,
            'currency' => $quote->currency,
            'fulfilment_type' => $quote->fulfilment->value,
            'items' => array_map(fn (QuoteLine $line) => [
                'id' => $line->item?->id,
                'product' => [
                    'id' => $line->product->id,
                    'slug' => $line->product->slug,
                    'name' => $line->product->name,
                    'image' => ($img = $line->product->primaryImage) ? ['url' => $img->url, 'alt' => $img->alt_text] : null,
                    'max_quantity' => $line->product->maxOrderableQuantity(),
                ],
                'quantity' => $line->quantity,
                /** One burger as configured: base_price + add-ons. */
                'unit_price' => $line->unitPrice,
                'base_price' => $line->basePrice(),
                'addons' => array_map(fn (array $a) => [
                    'id' => $a['addon']->id,
                    'slug' => $a['addon']->slug,
                    'name' => $a['addon']->name,
                    'quantity' => $a['quantity'],
                    'unit_price' => $a['unit_price'],
                ], $line->addons),
                'line_total' => $line->lineTotal,
                'issue' => $line->issue,
            ], $quote->lines),
            'item_count' => $quote->itemCount(),
            'coupon' => $quote->coupon ? [
                'code' => $quote->coupon->code,
                'description' => $quote->coupon->description,
                'is_valid' => $quote->couponError === null,
                'error' => $quote->couponError,
            ] : null,
            'subtotal' => $quote->subtotal,
            'discount_total' => $quote->discount,
            'delivery_fee' => $quote->deliveryFee,
            'total' => $quote->total,
            'minimum_order_amount' => $quote->minimumOrderAmount,
            'free_delivery_threshold' => $quote->freeDeliveryThreshold,
            'can_checkout' => $quote->canCheckout(),
            'issues' => $quote->issues,
        ];
    }
}
