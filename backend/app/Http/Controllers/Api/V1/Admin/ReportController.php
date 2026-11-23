<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Services\Dashboard\DashboardService;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * @tags Admin · Reports
 */
class ReportController extends Controller
{
    /**
     * Order statistics for orders placed between two dates (inclusive, restaurant timezone).
     *
     * Defaults to the last 30 days. Includes counts by status, fulfilment and payment method,
     * revenue, average order value, cancellation rate and orders per hour of the day.
     */
    public function orders(Request $request, DashboardService $dashboard): JsonResponse
    {
        $v = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
        ]);
        $tz = (string) config('restaurant.timezone');
        $to = isset($v['to']) ? CarbonImmutable::createFromFormat('Y-m-d', $v['to'], $tz) : CarbonImmutable::now($tz);
        $from = isset($v['from']) ? CarbonImmutable::createFromFormat('Y-m-d', $v['from'], $tz) : $to->subDays(29);

        if ($from->startOfDay()->diffInDays($to->startOfDay()) > 366) {
            return response()->json(['message' => 'The range may span at most 366 days.', 'errors' => ['from' => ['The range may span at most 366 days.']]], 422);
        }

        return response()->json(['data' => $dashboard->orderStatistics($from->startOfDay(), $to->startOfDay()->addDay())]);
    }
}
