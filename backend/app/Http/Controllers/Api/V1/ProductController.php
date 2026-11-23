<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\ProductIndexRequest;
use App\Http\Resources\ProductResource;
use App\Models\Product;
use App\Support\Money;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * @tags Menu
 */
class ProductController extends Controller
{
    /**
     * List menu products.
     *
     * Only products on the menu (`is_available`) are listed; sold-out ones are included with
     * `in_stock: false` unless `in_stock=1`. Prices are integer cents.
     *
     * @unauthenticated
     */
    public function index(ProductIndexRequest $request): AnonymousResourceCollection
    {
        $query = $this->catalogue()->available();

        $query
            ->when($request->validated('search'), fn (Builder $q, string $term) => $q->search($term))
            ->when($request->validated('category'), fn (Builder $q, string $slug) => $q->inCategory($slug))
            ->when($request->boolean('featured'), fn (Builder $q) => $q->where('is_featured', true))
            ->when($request->boolean('on_sale'), fn (Builder $q) => $q->whereNotNull('compare_at_price'))
            ->when($request->boolean('in_stock'), fn (Builder $q) => $q->where(fn ($s) => $s->where('track_stock', false)->orWhere('stock_quantity', '>', 0)))
            ->when($request->validated('min_price') !== null, fn (Builder $q) => $q->where('price', '>=', Money::toDecimal((int) $request->validated('min_price'))))
            ->when($request->validated('max_price') !== null, fn (Builder $q) => $q->where('price', '<=', Money::toDecimal((int) $request->validated('max_price'))));

        match ($request->validated('sort') ?? 'menu') {
            'price' => $query->orderBy('price'),
            '-price' => $query->orderByDesc('price'),
            'name' => $query->orderBy('name'),
            '-name' => $query->orderByDesc('name'),
            'newest' => $query->orderByDesc('created_at'),
            'rating' => $query->orderByRaw('reviews_avg_rating DESC NULLS LAST'),
            default => $query->orderBy('sort_order'),
        };
        $query->orderBy('id');

        return ProductResource::collection(
            $query->paginate((int) ($request->validated('per_page') ?? 24))->withQueryString()
        );
    }

    /**
     * Show a product by id or slug.
     *
     * Products taken off the menu are still returned (with `is_available: false`) so old links keep working.
     *
     * @unauthenticated
     */
    public function show(Product $product): ProductResource
    {
        $product = $this->catalogue()->whereKey($product->id)->firstOrFail();

        return new ProductResource($product);
    }

    private function catalogue(): Builder
    {
        $published = fn ($q) => $q->where('is_published', true);

        return Product::query()
            ->with([
                'images',
                'categories' => fn ($q) => $q->where('is_active', true)->orderBy('sort_order'),
                'addons' => fn ($q) => $q->where('addons.is_available', true),
            ])
            ->withAvg(['reviews' => $published], 'rating')
            ->withCount(['reviews' => $published]);
    }
}
