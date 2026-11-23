<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\AdminProductIndexRequest;
use App\Http\Requests\Admin\ProductRequest;
use App\Http\Resources\AdminProductResource;
use App\Models\Product;
use App\Services\Product\ProductService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

/**
 * @tags Admin · Products
 */
class ProductController extends Controller
{
    public function __construct(private readonly ProductService $products) {}

    /** All products, including those off the menu (and deleted ones with `with_trashed=1`). */
    public function index(AdminProductIndexRequest $request): AnonymousResourceCollection
    {
        $products = Product::query()
            ->with(['images', 'categories'])
            ->when($request->boolean('with_trashed'), fn ($q) => $q->withTrashed())
            ->when($request->validated('search'), fn ($q, $term) => $q->search($term))
            ->when($request->validated('category'), fn ($q, $slug) => $q->whereHas('categories', fn ($c) => $c->where('slug', $slug)))
            ->when($request->has('is_available'), fn ($q) => $q->where('is_available', $request->boolean('is_available')))
            ->when($request->validated('stock_status'), fn ($q, $status) => match ($status) {
                'unlimited' => $q->where('track_stock', false),
                'out_of_stock' => $q->where('track_stock', true)->where('stock_quantity', 0),
                'low_stock' => $q->where('track_stock', true)->where('stock_quantity', '>', 0)->whereColumn('stock_quantity', '<=', 'low_stock_threshold'),
                'in_stock' => $q->where('track_stock', true)->whereColumn('stock_quantity', '>', 'low_stock_threshold'),
            })
            ->orderBy('sort_order')
            ->orderBy('id')
            ->paginate((int) ($request->validated('per_page') ?? 50))
            ->withQueryString();

        return AdminProductResource::collection($products);
    }

    /** Create a product (prices in cents). */
    public function store(ProductRequest $request): JsonResponse
    {
        $product = $this->products->create($request->validated(), $request->user());

        return (new AdminProductResource($product->load(['images', 'categories'])))->response()->setStatusCode(201);
    }

    /** A product with its images, categories, recipe and add-ons. */
    public function show(Product $product): AdminProductResource
    {
        return new AdminProductResource($product->load(['images', 'categories', 'ingredients', 'addons']));
    }

    /**
     * Update a product: details, price, availability, categories.
     *
     * Stock is changed with `POST /admin/products/{product}/stock`.
     */
    public function update(ProductRequest $request, Product $product): AdminProductResource
    {
        $product = $this->products->update($product, $request->validated());

        return new AdminProductResource($product->load(['images', 'categories']));
    }

    /**
     * Delete a product (soft delete).
     *
     * It disappears from the menu and carts; past orders keep their snapshots.
     */
    public function destroy(Product $product): Response
    {
        $product->delete();

        return response()->noContent();
    }

    /** Restore a deleted product. */
    public function restore(Request $request, Product $product): AdminProductResource
    {
        try {
            DB::transaction(fn () => $product->restore());
        } catch (UniqueConstraintViolationException) {
            throw new ApiException('Another product now uses this slug. Change that product\'s slug first.', 'slug_taken', 409);
        }

        return new AdminProductResource($product->load(['images', 'categories']));
    }
}
