<?php

namespace App\Http\Resources;

use App\Models\Product;
use App\Support\Quantity;
use Illuminate\Http\Request;

/** @mixin Product */
class AdminProductResource extends ProductResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $data = parent::toArray($request);
        // Administrators see every add-on linked to the product, switched off or not.
        unset($data['addons']);

        return $data + [
            'addons' => $this->whenLoaded('addons', fn () => $this->addons->map(fn ($addon) => [
                'id' => $addon->id,
                'slug' => $addon->slug,
                'name' => $addon->name,
                'kind' => $addon->kind->value,
                'price' => $addon->price,
                'is_available' => $addon->is_available,
                'max_quantity' => (int) $addon->pivot->max_quantity,
                'sort_order' => (int) $addon->pivot->sort_order,
            ])),
            'track_stock' => $this->track_stock,
            'stock_quantity' => $this->stock_quantity,
            'low_stock_threshold' => $this->low_stock_threshold,
            'sort_order' => $this->sort_order,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
            'deleted_at' => $this->deleted_at?->toIso8601String(),
            /** Ingredients used per unit sold (when loaded). */
            'recipe' => $this->whenLoaded('ingredients', fn () => $this->ingredients->map(fn ($i) => [
                'ingredient_id' => $i->id,
                'name' => $i->name,
                'unit' => $i->unit->value,
                'quantity' => Quantity::toFloat((string) $i->pivot->quantity),
            ])),
        ];
    }
}
