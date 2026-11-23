<?php

namespace App\Services\Inventory;

use App\Enums\IngredientMovementReason;
use App\Models\Ingredient;
use App\Models\IngredientMovement;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use App\Support\Quantity;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Every ingredient stock change goes through here and is written to ingredient_movements.
 *
 * Orders consume ingredients through product recipes and never fail because of them:
 * the count may go below zero, which the admin portal reports as a shortfall.
 */
class IngredientService
{
    /**
     * @param  array{name: string, unit: string, min_stock_level?: float|int|string, notes?: ?string, stock_quantity?: float|int|string}  $data
     */
    public function create(array $data, ?User $by): Ingredient
    {
        return DB::transaction(function () use ($data, $by) {
            $ingredient = Ingredient::query()->create([
                'name' => $data['name'],
                'unit' => $data['unit'],
                'min_stock_level' => Quantity::fromMilli(Quantity::toMilli($data['min_stock_level'] ?? 0)),
                'notes' => $data['notes'] ?? null,
            ]);

            $opening = Quantity::toMilli($data['stock_quantity'] ?? 0);
            if ($opening !== 0) {
                $this->move($ingredient, $opening, IngredientMovementReason::Restock, null, $by, 'Opening stock');
            }

            return $ingredient->refresh();
        });
    }

    /**
     * Manual stock change: a delivery, a stock-count correction, or waste.
     * Send either a signed `change` or an absolute `setTo`.
     */
    public function adjust(Ingredient $ingredient, IngredientMovementReason $reason, ?string $change, ?string $setTo, ?string $note, ?User $by): IngredientMovement
    {
        return DB::transaction(function () use ($ingredient, $reason, $change, $setTo, $note, $by) {
            $locked = Ingredient::query()->whereKey($ingredient->id)->lockForUpdate()->firstOrFail();
            $current = Quantity::toMilli($locked->stock_quantity);

            $delta = $setTo !== null ? Quantity::toMilli($setTo) - $current : Quantity::toMilli((string) $change);
            if ($reason === IngredientMovementReason::Waste && $delta > 0) {
                $delta = -$delta;
            }

            if ($delta === 0) {
                throw ValidationException::withMessages([$setTo !== null ? 'set_to' : 'change' => 'Stock is already at that level.']);
            }
            if ($reason === IngredientMovementReason::Restock && $delta < 0) {
                throw ValidationException::withMessages(['change' => 'A restock adds stock. Use a stock count or waste to remove it.']);
            }
            // Only orders can push a count below zero; a person recording stock never should.
            if ($current + $delta < 0) {
                throw ValidationException::withMessages([
                    'change' => 'That would take stock below zero (current: '.Quantity::toFloat($locked->stock_quantity).' '.$locked->unit->value.').',
                ]);
            }

            $movement = $this->move($locked, $delta, $reason, null, $by, $note);
            $ingredient->setRawAttributes($locked->getAttributes(), true);

            return $movement;
        });
    }

    /**
     * Replaces a product's recipe.
     *
     * @param  list<array{ingredient_id: int, quantity: float|int|string}>  $items
     */
    public function syncRecipe(Product $product, array $items): void
    {
        $product->ingredients()->sync(collect($items)->mapWithKeys(fn (array $item) => [
            (int) $item['ingredient_id'] => ['quantity' => Quantity::fromMilli(Quantity::toMilli($item['quantity']))],
        ])->all());
    }

    /**
     * Consumes ingredients for a newly placed order. Runs inside the order's transaction.
     *
     * @param  iterable<array{product: Product, quantity: int}>  $lines
     */
    public function consumeForOrder(Order $order, iterable $lines, ?User $by): void
    {
        $needed = [];
        foreach ($lines as ['product' => $product, 'quantity' => $quantity]) {
            foreach (DB::table('ingredient_product')->where('product_id', $product->id)->get(['ingredient_id', 'quantity']) as $row) {
                $needed[$row->ingredient_id] = ($needed[$row->ingredient_id] ?? 0) + Quantity::toMilli((string) $row->quantity) * $quantity;
            }
        }
        if ($needed === []) {
            return;
        }

        // Fixed lock order (by id) so two orders never deadlock on the same ingredients.
        $ingredients = Ingredient::query()->whereIn('id', array_keys($needed))->orderBy('id')->lockForUpdate()->get();
        foreach ($ingredients as $ingredient) {
            $this->move($ingredient, -$needed[$ingredient->id], IngredientMovementReason::Consumption, $order, $by, null);
        }
    }

    /** Returns what an order consumed. Safe to call more than once. */
    public function releaseForOrder(Order $order, ?User $by): void
    {
        $alreadyReleased = IngredientMovement::query()
            ->where('order_id', $order->id)
            ->where('reason', IngredientMovementReason::OrderRelease->value)
            ->exists();
        if ($alreadyReleased) {
            return;
        }

        $taken = IngredientMovement::query()
            ->where('order_id', $order->id)
            ->where('reason', IngredientMovementReason::Consumption->value)
            ->groupBy('ingredient_id')
            ->selectRaw('ingredient_id, SUM(change) AS total')
            ->pluck('total', 'ingredient_id');
        if ($taken->isEmpty()) {
            return;
        }

        $ingredients = Ingredient::withTrashed()->whereIn('id', $taken->keys())->orderBy('id')->lockForUpdate()->get();
        foreach ($ingredients as $ingredient) {
            $this->move($ingredient, -Quantity::toMilli((string) $taken[$ingredient->id]), IngredientMovementReason::OrderRelease, $order, $by, null);
        }
    }

    private function move(Ingredient $ingredient, int $deltaMilli, IngredientMovementReason $reason, ?Order $order, ?User $by, ?string $note): IngredientMovement
    {
        $before = Quantity::toMilli($ingredient->stock_quantity);
        $after = $before + $deltaMilli;

        $ingredient->forceFill(['stock_quantity' => Quantity::fromMilli($after)])->save();

        return IngredientMovement::query()->create([
            'ingredient_id' => $ingredient->id,
            'order_id' => $order?->id,
            'user_id' => $by?->id,
            'change' => Quantity::fromMilli($deltaMilli),
            'quantity_before' => Quantity::fromMilli($before),
            'quantity_after' => Quantity::fromMilli($after),
            'reason' => $reason,
            'note' => $note,
        ]);
    }
}
