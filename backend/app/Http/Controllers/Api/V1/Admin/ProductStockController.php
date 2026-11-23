<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\InventoryReason;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\AdjustStockRequest;
use App\Http\Resources\AdminProductResource;
use App\Http\Resources\InventoryLogResource;
use App\Models\Product;
use App\Services\Product\InventoryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\ValidationException;

/**
 * @tags Admin · Products
 */
class ProductStockController extends Controller
{
    /** Stock movements for a product (sales, releases, restocks, adjustments). */
    public function index(Request $request, Product $product): AnonymousResourceCollection
    {
        $logs = $product->inventoryLogs()
            ->with(['order', 'user'])
            ->latest('id')
            ->paginate(min(100, max(1, $request->integer('per_page', 25))));

        return InventoryLogResource::collection($logs);
    }

    /**
     * Change stock.
     *
     * Send `change` (+/- units) or `set_to` (absolute count). Every change is logged.
     */
    public function store(AdjustStockRequest $request, Product $product, InventoryService $inventory): JsonResponse
    {
        $change = $request->has('set_to')
            ? $request->integer('set_to') - $product->stock_quantity
            : $request->integer('change');

        if ($change === 0) {
            throw ValidationException::withMessages(['set_to' => 'Stock is already at that level.']);
        }

        $log = $inventory->adjust($product, $change, InventoryReason::from($request->validated('reason')), $request->validated('note'), $request->user());

        return response()->json([
            'data' => [
                'product' => new AdminProductResource($product->refresh()->load(['images', 'categories'])),
                'log' => new InventoryLogResource($log),
            ],
        ], 201);
    }
}
