<?php

namespace App\Http\Resources;

use App\Models\Addon;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * An add-on or extra topping. `price` is integer cents (LKR), charged per add-on per burger.
 * Admin responses also carry availability, sort order, timestamps and the linked products.
 *
 * @mixin Addon
 */
class AddonResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $admin = $request->routeIs('api.v1.admin.*');

        return [
            'id' => $this->id,
            'slug' => $this->slug,
            'name' => $this->name,
            'description' => $this->description,
            'kind' => $this->kind->value,
            'kind_label' => $this->kind->label(),
            'price' => $this->price,
            'currency' => config('restaurant.currency'),
            'is_available' => $this->when($admin, $this->is_available),
            'sort_order' => $this->when($admin, $this->sort_order),
            'products_count' => $this->whenCounted('products'),
            'products' => $this->when($admin && $this->relationLoaded('products'), fn () => $this->products->map(fn ($p) => [
                'id' => $p->id,
                'slug' => $p->slug,
                'name' => $p->name,
                'max_quantity' => (int) $p->pivot->max_quantity,
            ])),
            'created_at' => $this->when($admin, fn () => $this->created_at?->toIso8601String()),
            'updated_at' => $this->when($admin, fn () => $this->updated_at?->toIso8601String()),
            'deleted_at' => $this->when($admin, fn () => $this->deleted_at?->toIso8601String()),
        ];
    }
}
