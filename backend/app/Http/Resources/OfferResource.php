<?php

namespace App\Http\Resources;

use App\Models\Coupon;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Public view of an advertised coupon (no usage counts).
 *
 * @mixin Coupon
 */
class OfferResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'code' => $this->code,
            'description' => $this->description,
            'discount_type' => $this->discount_type->value,
            'percentage' => $this->percentage,
            'amount' => $this->amount,
            'max_discount_amount' => $this->max_discount_amount,
            'min_order_amount' => $this->min_order_amount,
            'expires_at' => $this->expires_at?->toIso8601String(),
        ];
    }
}
