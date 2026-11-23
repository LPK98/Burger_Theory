<?php

namespace App\Models;

use App\Casts\MoneyCast;
use App\Enums\AddonKind;
use App\Models\Concerns\ResolvesBySlugOrId;
use Database\Factories\AddonFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * An add-on or extra topping a customer can put on a burger (extra cheese, bacon, a sauce…).
 * Each product chooses which add-ons it offers through the addon_product pivot.
 *
 * @property int $price Minor units (cents), per add-on.
 */
#[Fillable(['slug', 'name', 'description', 'kind', 'price', 'is_available', 'sort_order'])]
class Addon extends Model
{
    /** @use HasFactory<AddonFactory> */
    use HasFactory, ResolvesBySlugOrId, SoftDeletes;

    protected $attributes = [
        'kind' => 'topping',
        'is_available' => true,
        'sort_order' => 0,
    ];

    protected function casts(): array
    {
        return [
            'kind' => AddonKind::class,
            'price' => MoneyCast::class,
            'is_available' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    public function products(): BelongsToMany
    {
        return $this->belongsToMany(Product::class)->withPivot('max_quantity', 'sort_order')->withTimestamps();
    }

    #[Scope]
    protected function available(Builder $query): void
    {
        $query->where('addons.is_available', true);
    }

    #[Scope]
    protected function ordered(Builder $query): void
    {
        $query->orderBy('addons.sort_order')->orderBy('addons.name');
    }
}
