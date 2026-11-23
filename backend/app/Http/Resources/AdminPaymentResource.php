<?php

namespace App\Http\Resources;

use App\Models\Payment;
use Illuminate\Http\Request;

/**
 * A payment as administrators see it. PayHere notifications are summarised (signature
 * check and outcome); their raw payloads are not exposed.
 *
 * @mixin Payment
 */
class AdminPaymentResource extends PaymentResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return parent::toArray($request) + [
            'id' => $this->id,
            'provider_payment_id' => $this->provider_payment_id,
            'provider_status_code' => $this->provider_status_code,
            'collected_by' => $this->whenLoaded('collectedBy', fn () => $this->collectedBy?->name),
            'order' => $this->whenLoaded('order', fn () => [
                'order_number' => $this->order->order_number,
                'status' => $this->order->status->value,
                'status_label' => $this->order->status->label(),
                'payment_status' => $this->order->payment_status->value,
                'customer_id' => $this->order->user_id,
                'customer_name' => $this->order->customer_name,
                'customer_email' => $this->order->customer_email,
                'total' => $this->order->total,
                'created_at' => $this->order->created_at?->toIso8601String(),
            ]),
            'events' => $this->whenLoaded('events', fn () => $this->events->map(fn ($e) => [
                'provider' => $e->provider,
                'provider_status_code' => $e->provider_status_code,
                'signature_valid' => $e->signature_valid,
                'outcome' => $e->outcome,
                'outcome_reason' => $e->outcome_reason,
                'at' => $e->created_at?->toIso8601String(),
            ])),
        ];
    }
}
