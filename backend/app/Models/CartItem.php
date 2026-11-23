<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Touches;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * One cart line: a product, its add-ons and a quantity. The same product with different
 * add-ons is a different line; `options_key` identifies the add-on combination ('' = none).
 */
#[Fillable(['product_id', 'quantity', 'options_key'])]
#[Touches(['cart'])]
class CartItem extends Model
{
    protected $attributes = [
        'options_key' => '',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
        ];
    }

    public function cart(): BelongsTo
    {
        return $this->belongsTo(Cart::class);
    }

    /** Includes soft-deleted products so a line can be shown as "no longer available". */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class)->withTrashed();
    }

    /** Chosen add-ons; pivot `quantity` is per burger. Includes deleted ones so the line can be flagged. */
    public function addons(): BelongsToMany
    {
        return $this->belongsToMany(Addon::class, 'cart_item_addons')->withPivot('quantity')->withTrashed()->orderBy('addons.sort_order')->orderBy('addons.id');
    }
}
