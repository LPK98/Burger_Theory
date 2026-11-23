<?php

namespace App\Http\Resources;

use App\Models\Ingredient;
use App\Support\Quantity;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Quantities are numbers in the ingredient's unit (e.g. 12.5 kg).
 *
 * @mixin Ingredient
 */
class IngredientResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $used = $this->resource->getAttribute('used_last_7_days');
        $daily = $used !== null ? Quantity::toFloat((string) $used) / 7 : null;
        $stock = Quantity::toFloat($this->stock_quantity);

        return [
            'id' => $this->id,
            'name' => $this->name,
            'unit' => $this->unit->value,
            'unit_label' => $this->unit->label(),
            'stock_quantity' => $stock,
            'min_stock_level' => Quantity::toFloat($this->min_stock_level),
            'stock_status' => $this->stockStatus(),
            'notes' => $this->notes,
            /** Net amount used by orders in the last 7 days (null when not requested). */
            'used_last_7_days' => $used !== null ? Quantity::toFloat((string) $used) : null,
            /** Days the current stock lasts at last week's pace; null when unused or not requested. */
            'days_of_cover' => $daily !== null && $daily > 0 ? round(max(0, $stock) / $daily, 1) : null,
            'products_count' => $this->whenCounted('products'),
            'products' => $this->whenLoaded('products', fn () => $this->products->map(fn ($p) => [
                'id' => $p->id,
                'name' => $p->name,
                'slug' => $p->slug,
                'quantity' => Quantity::toFloat((string) $p->pivot->quantity),
            ])),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
