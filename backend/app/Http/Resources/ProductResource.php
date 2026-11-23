<?php

namespace App\Http\Resources;

use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Public product shape. `price` and `compare_at_price` are integer cents (LKR), the
 * same convention as the frontend's Product.price.
 *
 * @mixin Product
 */
class ProductResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $image = $this->relationLoaded('images') ? $this->images->first() : null;

        return [
            'id' => $this->id,
            'slug' => $this->slug,
            'name' => $this->name,
            'description' => $this->description,
            'price' => $this->price,
            'compare_at_price' => $this->compare_at_price,
            'currency' => config('restaurant.currency'),
            'badge' => $this->badge,
            'is_featured' => $this->is_featured,
            'is_available' => $this->is_available,
            'in_stock' => ! $this->track_stock || $this->stock_quantity > 0,
            'stock_status' => $this->stockStatus(),
            'max_quantity' => $this->maxOrderableQuantity(),
            'image' => $image ? ['url' => $image->url, 'alt' => $image->alt_text] : null,
            'images' => ProductImageResource::collection($this->whenLoaded('images')),
            'categories' => $this->whenLoaded('categories', fn () => $this->categories->map(fn ($c) => [
                'id' => $c->id,
                'slug' => $c->slug,
                'name' => $c->name,
            ])),
            /** Add-ons customers can choose for this burger (switched-off ones are hidden). */
            'addons' => $this->whenLoaded('addons', fn () => $this->addons
                ->filter(fn ($addon) => $addon->is_available)
                ->values()
                ->map(fn ($addon) => [
                    'id' => $addon->id,
                    'slug' => $addon->slug,
                    'name' => $addon->name,
                    'description' => $addon->description,
                    'kind' => $addon->kind->value,
                    'price' => $addon->price,
                    'max_quantity' => (int) $addon->pivot->max_quantity,
                ])),
            'rating' => $this->when(array_key_exists('reviews_count', $this->resource->getAttributes()), fn () => [
                'average' => $this->reviews_avg_rating !== null ? round((float) $this->reviews_avg_rating, 1) : null,
                'count' => (int) $this->reviews_count,
            ]),
        ];
    }
}
