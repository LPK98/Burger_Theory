<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\SalesReportRequest;
use App\Http\Resources\AdminOrderResource;
use App\Services\Dashboard\DashboardService;
use Illuminate\Http\JsonResponse;

/**
 * @tags Admin · Dashboard
 */
class DashboardController extends Controller
{
    public function __construct(private readonly DashboardService $dashboard) {}

    /**
     * Dashboard summary.
     *
     * Revenue includes only paid orders (PayHere verified, or COD collected) that were not
     * cancelled or rejected. Money is integer cents.
     */
    public function summary(): JsonResponse
    {
        return response()->json(['data' => $this->dashboard->summary() + [
            'recent_orders' => AdminOrderResource::collection($this->dashboard->recentOrders(10)->load(['items', 'latestPayment'])),
            'low_stock_products' => $this->dashboard->lowStockProducts(),
            'low_stock_ingredients' => $this->dashboard->lowStockIngredients(),
            'recent_activity' => $this->dashboard->recentActivity(),
        ]]);
    }

    /**
     * Sales by day, week or month (restaurant timezone), empty periods included.
     */
    public function sales(SalesReportRequest $request): JsonResponse
    {
        [$from, $to] = $request->range();

        return response()->json(['data' => $this->dashboard->sales($request->granularity(), $from, $to)]);
    }

    /** Best-selling products by quantity (paid orders). */
    public function bestSellers(SalesReportRequest $request): JsonResponse
    {
        $range = $request->filled('from') || $request->filled('to') ? $request->range() : [null, null];

        return response()->json(['data' => $this->dashboard->bestSellers(
            min(50, max(1, $request->integer('limit', 20))),
            $range[0],
            $range[1]?->addDay(),
        )]);
    }
}
