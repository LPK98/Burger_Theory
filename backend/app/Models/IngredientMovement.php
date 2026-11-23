<?php

namespace App\Models;

use App\Enums\IngredientMovementReason;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['ingredient_id', 'order_id', 'user_id', 'change', 'quantity_before', 'quantity_after', 'reason', 'note'])]
class IngredientMovement extends Model
{
    public const UPDATED_AT = null;

    protected function casts(): array
    {
        return [
            'reason' => IngredientMovementReason::class,
            'change' => 'decimal:3',
            'quantity_before' => 'decimal:3',
            'quantity_after' => 'decimal:3',
            'created_at' => 'immutable_datetime',
        ];
    }

    public function ingredient(): BelongsTo
    {
        return $this->belongsTo(Ingredient::class)->withTrashed();
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class)->withTrashed();
    }
}
