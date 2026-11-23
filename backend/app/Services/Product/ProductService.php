<?php

namespace App\Services\Product;

use App\Models\Product;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ProductService
{
    public function __construct(private readonly InventoryService $inventory) {}

    /**
     * @param  array<string, mixed>  $data  Validated by StoreProductRequest.
     */
    public function create(array $data, User $by): Product
    {
        return DB::transaction(function () use ($data, $by) {
            $categoryIds = $data['category_ids'] ?? [];
            unset($data['category_ids']);

            $data['slug'] = $this->uniqueSlug($data['slug'] ?? $data['name']);
            $product = Product::query()->create($data);
            $product->categories()->sync($categoryIds);
            $this->inventory->recordOpeningStock($product, $by);

            return $product;
        });
    }

    /**
     * Stock is not changed here: use InventoryService::adjust so every change is logged.
     *
     * @param  array<string, mixed>  $data  Validated by UpdateProductRequest.
     */
    public function update(Product $product, array $data): Product
    {
        return DB::transaction(function () use ($product, $data) {
            $categoryIds = $data['category_ids'] ?? null;
            unset($data['category_ids'], $data['stock_quantity']);

            if (isset($data['slug'])) {
                $data['slug'] = $this->uniqueSlug($data['slug'], $product->id);
            }

            $product->update($data);
            if ($categoryIds !== null) {
                $product->categories()->sync($categoryIds);
            }

            return $product;
        });
    }

    private function uniqueSlug(string $source, ?int $ignoreId = null): string
    {
        $base = Str::slug($source) ?: 'product';
        if (ctype_digit($base)) {
            $base = "product-{$base}";
        }

        $slug = $base;
        $n = 2;
        while (Product::query()->where('slug', $slug)->when($ignoreId, fn ($q) => $q->whereKeyNot($ignoreId))->exists()) {
            $slug = "{$base}-{$n}";
            $n++;
        }

        return $slug;
    }
}
