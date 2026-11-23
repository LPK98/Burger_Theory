<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\IngredientMovementReason;
use App\Http\Controllers\Controller;
use App\Http\Resources\IngredientMovementResource;
use App\Models\IngredientMovement;
use App\Support\Quantity;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * @tags Admin · Inventory
 */
class InventoryController extends Controller
{
    /** Every ingredient stock movement, newest first. Dates are in the restaurant timezone. */
    public function movements(Request $request): AnonymousResourceCollection
    {
        $v = $request->validate([
            'ingredient_id' => ['nullable', 'integer'],
            'reason' => ['nullable', Rule::enum(IngredientMovementReason::class)],
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:date_from'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
        [$from, $to] = $this->range($v['date_from'] ?? null, $v['date_to'] ?? null, null);

        $movements = IngredientMovement::query()
            ->with(['ingredient', 'order', 'user'])
            ->when($v['ingredient_id'] ?? null, fn (Builder $q, $id) => $q->where('ingredient_id', $id))
            ->when($v['reason'] ?? null, fn (Builder $q, $reason) => $q->where('reason', $reason))
            ->when($from, fn (Builder $q) => $q->where('created_at', '>=', $from->utc()))
            ->when($to, fn (Builder $q) => $q->where('created_at', '<', $to->utc()))
            ->latest('id')
            ->paginate((int) ($v['per_page'] ?? 25))
            ->withQueryString();

        return IngredientMovementResource::collection($movements);
    }

    /**
     * Consumption per ingredient over a period (default: the last 30 days).
     *
     * `used` is what orders consumed net of returns; `restocked`, `wasted` and `adjusted`
     * are the manual movements in the same period. Amounts are in each ingredient's unit.
     */
    public function consumption(Request $request): JsonResponse
    {
        $v = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
        ]);
        $tz = (string) config('restaurant.timezone');
        [$from, $to] = $this->range($v['from'] ?? null, $v['to'] ?? null, 29);

        $rows = DB::table('ingredient_movements')
            ->join('ingredients', 'ingredients.id', '=', 'ingredient_movements.ingredient_id')
            ->where('ingredient_movements.created_at', '>=', $from->utc())
            ->where('ingredient_movements.created_at', '<', $to->utc())
            ->groupBy('ingredients.id', 'ingredients.name', 'ingredients.unit', 'ingredients.stock_quantity', 'ingredients.deleted_at')
            ->select('ingredients.id', 'ingredients.name', 'ingredients.unit', 'ingredients.stock_quantity', 'ingredients.deleted_at')
            ->selectRaw("COALESCE(-SUM(change) FILTER (WHERE reason IN ('consumption', 'order_release')), 0) AS used")
            ->selectRaw("COALESCE(SUM(change) FILTER (WHERE reason = 'restock'), 0) AS restocked")
            ->selectRaw("COALESCE(-SUM(change) FILTER (WHERE reason = 'waste'), 0) AS wasted")
            ->selectRaw("COALESCE(SUM(change) FILTER (WHERE reason = 'adjustment'), 0) AS adjusted")
            ->orderByDesc('used')
            ->orderBy('ingredients.name')
            ->get();

        return response()->json(['data' => [
            'from' => $from->toDateString(),
            'to' => $to->subDay()->toDateString(),
            'timezone' => $tz,
            'ingredients' => $rows->map(fn ($r) => [
                'id' => $r->id,
                'name' => $r->name,
                'unit' => $r->unit,
                'deleted' => $r->deleted_at !== null,
                'stock_quantity' => Quantity::toFloat((string) $r->stock_quantity),
                'used' => Quantity::toFloat((string) $r->used),
                'restocked' => Quantity::toFloat((string) $r->restocked),
                'wasted' => Quantity::toFloat((string) $r->wasted),
                'adjusted' => Quantity::toFloat((string) $r->adjusted),
            ]),
        ]]);
    }

    /**
     * Inclusive local dates to a half-open UTC-comparable range [from, to).
     *
     * @return array{0: ?CarbonImmutable, 1: ?CarbonImmutable}
     */
    private function range(?string $from, ?string $to, ?int $defaultDays): array
    {
        $tz = (string) config('restaurant.timezone');
        $end = $to !== null ? CarbonImmutable::createFromFormat('Y-m-d', $to, $tz)->startOfDay()->addDay() : null;
        $start = $from !== null ? CarbonImmutable::createFromFormat('Y-m-d', $from, $tz)->startOfDay() : null;

        if ($defaultDays !== null) {
            $end ??= CarbonImmutable::now($tz)->startOfDay()->addDay();
            $start ??= $end->subDays($defaultDays + 1);
        }

        return [$start, $end];
    }
}
