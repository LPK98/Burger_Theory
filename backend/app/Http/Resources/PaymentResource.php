<?php

namespace App\Http\Resources;

use App\Models\Payment;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Payment */
class PaymentResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'reference' => $this->reference,
            'order_number' => $this->whenLoaded('order', fn () => $this->order->order_number),
            'method' => $this->method->value,
            'status' => $this->status->value,
            'amount' => $this->amount,
            'currency' => $this->currency,
            'provider_method' => $this->provider_method,
            'card_mask' => $this->card_mask,
            'status_message' => $this->provider_status_message,
            'paid_at' => $this->paid_at?->toIso8601String(),
            'collected_at' => $this->collected_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
