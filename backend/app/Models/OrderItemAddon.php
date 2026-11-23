<?php

namespace App\Models;

use App\Casts\MoneyCast;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** An add-on as it was sold: name and price are snapshots; quantity is per burger. */
#[Fillable(['addon_id', 'addon_name', 'unit_price', 'quantity'])]
class OrderItemAddon extends Model
{
    protected function casts(): array
    {
        return [
            'unit_price' => MoneyCast::class,
            'quantity' => 'integer',
        ];
    }

    public function orderItem(): BelongsTo
    {
        return $this->belongsTo(OrderItem::class);
    }

    public function addon(): BelongsTo
    {
        return $this->belongsTo(Addon::class)->withTrashed();
    }
}
