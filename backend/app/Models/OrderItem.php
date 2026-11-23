<?php

namespace App\Models;

use App\Casts\MoneyCast;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Name, slug and price are snapshots taken when the order was placed.
 *
 * `unit_price` is one burger as ordered, add-ons included; `addons_unit_price` is the add-on
 * part of it, so the product's own price was `unit_price - addons_unit_price`.
 */
#[Fillable(['product_id', 'product_name', 'product_slug', 'unit_price', 'addons_unit_price', 'quantity', 'line_total'])]
class OrderItem extends Model
{
    /** Add-ons are part of what an item is, so they always come with it (one extra query per load). */
    protected $with = ['addons'];

    protected $attributes = [
        'addons_unit_price' => '0.00',
    ];

    protected function casts(): array
    {
        return [
            'unit_price' => MoneyCast::class,
            'addons_unit_price' => MoneyCast::class,
            'line_total' => MoneyCast::class,
            'quantity' => 'integer',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class)->withTrashed();
    }

    public function addons(): HasMany
    {
        return $this->hasMany(OrderItemAddon::class)->orderBy('id');
    }

    public function baseUnitPrice(): int
    {
        return $this->unit_price - $this->addons_unit_price;
    }
}
