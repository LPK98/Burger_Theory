<?php

namespace App\Http\Resources;

use App\Models\IngredientMovement;
use App\Support\Quantity;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin IngredientMovement */
class IngredientMovementResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'ingredient' => $this->whenLoaded('ingredient', fn () => [
                'id' => $this->ingredient->id,
                'name' => $this->ingredient->name,
                'unit' => $this->ingredient->unit->value,
            ]),
            'change' => Quantity::toFloat($this->change),
            'quantity_before' => Quantity::toFloat($this->quantity_before),
            'quantity_after' => Quantity::toFloat($this->quantity_after),
            'reason' => $this->reason->value,
            'reason_label' => $this->reason->label(),
            'note' => $this->note,
            'order_number' => $this->whenLoaded('order', fn () => $this->order?->order_number),
            'user' => $this->whenLoaded('user', fn () => $this->user?->name),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
