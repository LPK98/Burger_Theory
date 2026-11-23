<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\IngredientMovementReason;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\AdjustIngredientRequest;
use App\Http\Requests\Admin\IngredientRequest;
use App\Http\Resources\IngredientMovementResource;
use App\Http\Resources\IngredientResource;
use App\Models\Ingredient;
use App\Models\IngredientMovement;
use App\Services\Inventory\IngredientService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

/**
 * @tags Admin · Inventory
 */
class IngredientController extends Controller
{
    public function __construct(private readonly IngredientService $ingredients) {}

    /**
     * All ingredients with stock status and last week's usage.
     *
     * `status` filters to in_stock, low_stock (at or below the minimum) or out_of_stock (zero or less).
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', 'in:in_stock,low_stock,out_of_stock'],
            /** name (default) or urgency (empty first, then low, then by days of cover). */
            'sort' => ['nullable', 'in:name,urgency'],
        ]);

        $query = Ingredient::query()
            ->withCount('products')
            ->addSelect(['used_last_7_days' => self::usageSince(now()->subDays(7))])
            ->when($validated['search'] ?? null, fn (Builder $q, string $term) => $q->where('name', 'ilike', '%'.addcslashes($term, '%_\\').'%'))
            ->when($validated['status'] ?? null, fn (Builder $q, string $status) => $q->stockStatusIs($status));

        if (($validated['sort'] ?? 'name') === 'urgency') {
            $query->orderByRaw('CASE WHEN stock_quantity <= 0 THEN 0 WHEN stock_quantity <= min_stock_level THEN 1 ELSE 2 END')
                ->orderByRaw('stock_quantity - min_stock_level');
        }

        return IngredientResource::collection($query->orderBy('name')->get());
    }

    /** Add an ingredient, with optional opening stock. */
    public function store(IngredientRequest $request): JsonResponse
    {
        $ingredient = $this->ingredients->create($request->validated(), $request->user());

        return (new IngredientResource($ingredient->loadCount('products')))->response()->setStatusCode(201);
    }

    /** An ingredient with the products that use it. */
    public function show(Ingredient $ingredient): IngredientResource
    {
        $ingredient = Ingredient::query()
            ->whereKey($ingredient->id)
            ->withCount('products')
            ->addSelect(['used_last_7_days' => self::usageSince(now()->subDays(7))])
            ->with('products')
            ->firstOrFail();

        return new IngredientResource($ingredient);
    }

    /** Rename, change the minimum level or notes. Stock changes go through adjustments. */
    public function update(IngredientRequest $request, Ingredient $ingredient): IngredientResource
    {
        $ingredient->update($request->validated());

        return new IngredientResource($ingredient->loadCount('products'));
    }

    /** Remove an ingredient. It leaves every recipe; its history is kept. */
    public function destroy(Ingredient $ingredient): Response
    {
        DB::transaction(function () use ($ingredient) {
            $ingredient->products()->detach();
            $ingredient->delete();
        });

        return response()->noContent();
    }

    /**
     * Record a stock change: restock, stock count (adjustment) or waste.
     *
     * Send `change` (signed amount) or `set_to` (the counted amount). Manual changes can't
     * take stock below zero.
     */
    public function adjust(AdjustIngredientRequest $request, Ingredient $ingredient): JsonResponse
    {
        $movement = $this->ingredients->adjust(
            $ingredient,
            $request->reason(),
            $request->has('change') ? (string) $request->validated('change') : null,
            $request->has('set_to') ? (string) $request->validated('set_to') : null,
            $request->validated('note'),
            $request->user(),
        );

        return response()->json([
            'data' => [
                'ingredient' => new IngredientResource($ingredient->refresh()->loadCount('products')),
                'movement' => new IngredientMovementResource($movement->load(['user', 'order'])),
            ],
        ], 201);
    }

    /** Stock history for one ingredient, newest first. */
    public function movements(Request $request, Ingredient $ingredient): AnonymousResourceCollection
    {
        $movements = $ingredient->movements()
            ->with(['order', 'user'])
            ->latest('id')
            ->paginate(min(100, max(1, $request->integer('per_page', 25))));

        return IngredientMovementResource::collection($movements);
    }

    /** Net amount used by orders since a moment (consumption minus returns), per ingredient row. */
    public static function usageSince(\DateTimeInterface $since): Builder
    {
        return IngredientMovement::query()
            ->selectRaw('COALESCE(-SUM(change), 0)')
            ->whereColumn('ingredient_movements.ingredient_id', 'ingredients.id')
            ->whereIn('reason', [IngredientMovementReason::Consumption->value, IngredientMovementReason::OrderRelease->value])
            ->where('created_at', '>=', $since);
    }
}
