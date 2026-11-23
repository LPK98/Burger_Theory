<?php

namespace App\Services\Product;

use App\Enums\InventoryReason;
use App\Exceptions\CartException;
use App\Models\InventoryLog;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use App\Services\Inventory\IngredientService;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Every stock movement goes through here and is written to inventory_logs.
 * Callers hold row locks (SELECT … FOR UPDATE) on the products involved.
 * Orders also consume (and on void, return) kitchen ingredients through product recipes.
 */
class InventoryService
{
    public function __construct(private readonly IngredientService $ingredients) {}

    /**
     * Takes stock for a new order. Products must already be locked by the caller.
     *
     * @param  iterable<array{product: Product, quantity: int}>  $lines
     */
    public function deductForOrder(Order $order, iterable $lines, ?User $by): void
    {
        $lines = is_array($lines) ? $lines : iterator_to_array($lines, false);
        foreach ($lines as ['product' => $product, 'quantity' => $quantity]) {
            if (! $product->track_stock) {
                continue;
            }
            if ($product->stock_quantity < $quantity) {
                throw CartException::insufficientStock($product, $product->stock_quantity);
            }
            $this->move($product, -$quantity, InventoryReason::Sale, $order, $by, null);
        }

        $this->ingredients->consumeForOrder($order, $lines, $by);
    }

    /** Returns the stock an order took. Safe to call more than once. */
    public function releaseForOrder(Order $order, ?User $by): void
    {
        $this->ingredients->releaseForOrder($order, $by);

        $alreadyReleased = InventoryLog::query()
            ->where('order_id', $order->id)
            ->where('reason', InventoryReason::OrderRelease->value)
            ->exists();
        if ($alreadyReleased) {
            return;
        }

        $taken = InventoryLog::query()
            ->where('order_id', $order->id)
            ->where('reason', InventoryReason::Sale->value)
            ->groupBy('product_id')
            ->selectRaw('product_id, SUM(change) AS total')
            ->pluck('total', 'product_id');

        if ($taken->isEmpty()) {
            return;
        }

        $products = Product::withTrashed()->whereIn('id', $taken->keys())->orderBy('id')->lockForUpdate()->get();
        foreach ($products as $product) {
            $this->move($product, -(int) $taken[$product->id], InventoryReason::OrderRelease, $order, $by, null);
        }
    }

    /** Manual stock change by an administrator (restock or correction). */
    public function adjust(Product $product, int $change, InventoryReason $reason, ?string $note, User $by): InventoryLog
    {
        return DB::transaction(function () use ($product, $change, $reason, $note, $by) {
            $locked = Product::withTrashed()->whereKey($product->id)->lockForUpdate()->firstOrFail();

            if ($locked->stock_quantity + $change < 0) {
                throw ValidationException::withMessages([
                    'change' => "Stock cannot go below zero (current stock: {$locked->stock_quantity}).",
                ]);
            }

            $log = $this->move($locked, $change, $reason, null, $by, $note);
            $product->setRawAttributes($locked->getAttributes(), true);

            return $log;
        });
    }

    /** Opening stock for a newly created product. */
    public function recordOpeningStock(Product $product, User $by): void
    {
        if ($product->track_stock && $product->stock_quantity > 0) {
            InventoryLog::query()->create([
                'product_id' => $product->id,
                'user_id' => $by->id,
                'change' => $product->stock_quantity,
                'quantity_before' => 0,
                'quantity_after' => $product->stock_quantity,
                'reason' => InventoryReason::Restock,
                'note' => 'Opening stock',
            ]);
        }
    }

    private function move(Product $product, int $change, InventoryReason $reason, ?Order $order, ?User $by, ?string $note): InventoryLog
    {
        $before = $product->stock_quantity;
        $product->stock_quantity = $before + $change;
        $product->save();

        return InventoryLog::query()->create([
            'product_id' => $product->id,
            'order_id' => $order?->id,
            'user_id' => $by?->id,
            'change' => $change,
            'quantity_before' => $before,
            'quantity_after' => $product->stock_quantity,
            'reason' => $reason,
            'note' => $note,
        ]);
    }
}
