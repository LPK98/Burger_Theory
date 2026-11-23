<?php

namespace App\Http\Resources;

use App\Models\Order;
use Illuminate\Http\Request;

/** @mixin Order */
class AdminOrderResource extends OrderResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $data = parent::toArray($request);
        unset($data['can_cancel'], $data['can_pay_online']);

        // array_merge, not `+`: the admin timeline (with actor, staff name and note) must
        // replace the customer-facing one the parent already added.
        return array_merge($data, [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'cancelled_by' => $this->cancelled_by?->value,
            'next_statuses' => array_map(fn ($s) => $s->value, $this->status->nextStatuses($this->fulfilment_type)),
            'payments' => PaymentResource::collection($this->whenLoaded('payments')),
            'timeline' => $this->whenLoaded('statusHistory', fn () => $this->statusHistory->map(fn ($h) => [
                'from' => $h->from_status?->value,
                'status' => $h->to_status->value,
                'label' => $h->to_status->label(),
                'actor' => $h->actor_type->value,
                'changed_by' => $h->changedBy?->name,
                'note' => $h->note,
                'at' => $h->created_at?->toIso8601String(),
            ])),
        ]);
    }
}
