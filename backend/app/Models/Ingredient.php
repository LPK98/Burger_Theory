<?php

namespace App\Models;

use App\Enums\IngredientUnit;
use App\Support\Quantity;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A kitchen ingredient. Quantities are decimal strings ("12.500") in the ingredient's unit.
 *
 * @property string $stock_quantity
 * @property string $min_stock_level
 */
#[Fillable(['name', 'unit', 'min_stock_level', 'notes'])]
class Ingredient extends Model
{
    use SoftDeletes;

    protected $attributes = [
        'stock_quantity' => 0,
        'min_stock_level' => 0,
    ];

    protected function casts(): array
    {
        return [
            'unit' => IngredientUnit::class,
            'stock_quantity' => 'decimal:3',
            'min_stock_level' => 'decimal:3',
        ];
    }

    public function movements(): HasMany
    {
        return $this->hasMany(IngredientMovement::class);
    }

    public function products(): BelongsToMany
    {
        return $this->belongsToMany(Product::class)->withPivot('quantity')->withTimestamps();
    }

    /** @return 'out_of_stock'|'low_stock'|'in_stock' */
    public function stockStatus(): string
    {
        $stock = Quantity::toMilli($this->stock_quantity);

        return match (true) {
            $stock <= 0 => 'out_of_stock',
            $stock <= Quantity::toMilli($this->min_stock_level) => 'low_stock',
            default => 'in_stock',
        };
    }

    /** At or below the minimum level (including empty and negative counts). */
    #[Scope]
    protected function lowStock(Builder $query): void
    {
        $query->whereColumn('stock_quantity', '<=', 'min_stock_level');
    }

    #[Scope]
    protected function stockStatusIs(Builder $query, string $status): void
    {
        match ($status) {
            'out_of_stock' => $query->where('stock_quantity', '<=', 0),
            'low_stock' => $query->where('stock_quantity', '>', 0)->whereColumn('stock_quantity', '<=', 'min_stock_level'),
            'in_stock' => $query->whereColumn('stock_quantity', '>', 'min_stock_level')->where('stock_quantity', '>', 0),
        };
    }
}
