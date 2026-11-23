<?php

namespace App\Http\Resources;

use App\Enums\FulfilmentType;
use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Customer view of an order. Money is integer cents.
 *
 * @mixin Order
 */
class OrderResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'order_number' => $this->order_number,
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'payment_method' => $this->payment_method->value,
            'payment_status' => $this->payment_status->value,
            'fulfilment_type' => $this->fulfilment_type->value,
            'currency' => $this->currency,
            'subtotal' => $this->subtotal,
            'discount_total' => $this->discount_total,
            'delivery_fee' => $this->delivery_fee,
            'total' => $this->total,
            'coupon_code' => $this->coupon_code,
            'customer' => [
                'name' => $this->customer_name,
                'email' => $this->customer_email,
                'phone' => $this->customer_phone,
            ],
            'delivery_address' => $this->fulfilment_type === FulfilmentType::Delivery ? [
                'recipient_name' => $this->delivery_recipient_name,
                'phone' => $this->delivery_phone,
                'line1' => $this->delivery_line1,
                'line2' => $this->delivery_line2,
                'city' => $this->delivery_city,
                'postal_code' => $this->delivery_postal_code,
                'delivery_instructions' => $this->delivery_instructions,
            ] : null,
            'notes' => $this->customer_notes,
            'items' => $this->whenLoaded('items', fn () => $this->items->map(fn ($item) => [
                'product_id' => $item->product_id,
                'product_slug' => $item->product_slug,
                'name' => $item->product_name,
                /** One burger as ordered, add-ons included. */
                'unit_price' => $item->unit_price,
                'base_unit_price' => $item->baseUnitPrice(),
                'addons_unit_price' => $item->addons_unit_price,
                'addons' => $item->addons->map(fn ($addon) => [
                    'addon_id' => $addon->addon_id,
                    'name' => $addon->addon_name,
                    'quantity' => $addon->quantity,
                    'unit_price' => $addon->unit_price,
                ])->values(),
                'quantity' => $item->quantity,
                'line_total' => $item->line_total,
            ])),
            'item_count' => $this->whenLoaded('items', fn () => (int) $this->items->sum('quantity')),
            'payment' => $this->whenLoaded('latestPayment', fn () => $this->latestPayment ? new PaymentResource($this->latestPayment) : null),
            'timeline' => $this->whenLoaded('statusHistory', fn () => $this->statusHistory->map(fn ($h) => [
                'status' => $h->to_status->value,
                'label' => $h->to_status->label(),
                'note' => $h->note,
                'at' => $h->created_at?->toIso8601String(),
            ])),
            'can_cancel' => $this->isCancellableByCustomer(),
            'can_pay_online' => $this->isAwaitingOnlinePayment(),
            'cancellation_reason' => $this->cancellation_reason,
            'estimated_ready_at' => $this->estimated_ready_at?->toIso8601String(),
            'paid_at' => $this->paid_at?->toIso8601String(),
            'delivered_at' => $this->delivered_at?->toIso8601String(),
            'cancelled_at' => $this->cancelled_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
