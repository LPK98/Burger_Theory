<?php

namespace App\Http\Resources;

use App\Models\User;
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A customer as administrators see them. Never includes the password hash, tokens or
 * remember token. `total_spent` (cents) counts paid orders that were not cancelled.
 *
 * @mixin User
 */
class AdminCustomerResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $spent = $this->resource->getAttribute('total_spent');
        $last = $this->resource->getAttribute('last_order_at');

        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'phone' => $this->phone,
            'email_verified' => $this->email_verified_at !== null,
            'registered_at' => $this->created_at?->toIso8601String(),
            'orders_count' => (int) ($this->resource->getAttribute('orders_count') ?? 0),
            'total_spent' => $spent !== null ? Money::toMinor((string) $spent) : 0,
            'last_order_at' => $last !== null ? \Carbon\CarbonImmutable::parse($last)->toIso8601String() : null,
        ];
    }
}
