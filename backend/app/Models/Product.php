<?php

namespace App\Models;

use App\Casts\MoneyCast;
use App\Models\Concerns\ResolvesBySlugOrId;
use Database\Factories\ProductFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * @property int $price Minor units (cents).
 * @property int|null $compare_at_price Minor units (cents).
 */
#[Fillable([
    'slug', 'name', 'description', 'price', 'compare_at_price', 'badge',
    'is_available', 'is_featured', 'track_stock', 'stock_quantity', 'low_stock_threshold', 'sort_order',
])]
class Product extends Model
{
    /** @use HasFactory<ProductFactory> */
    use HasFactory, ResolvesBySlugOrId, SoftDeletes;

    protected $attributes = [
        'is_available' => true,
        'is_featured' => false,
        'track_stock' => true,
        'stock_quantity' => 0,
        'low_stock_threshold' => 5,
        'sort_order' => 0,
    ];

    protected function casts(): array
    {
        return [
            'price' => MoneyCast::class,
            'compare_at_price' => MoneyCast::class,
            'is_available' => 'boolean',
            'is_featured' => 'boolean',
            'track_stock' => 'boolean',
            'stock_quantity' => 'integer',
            'low_stock_threshold' => 'integer',
            'sort_order' => 'integer',
        ];
    }

    public function categories(): BelongsToMany
    {
        return $this->belongsToMany(Category::class);
    }

    public function images(): HasMany
    {
        return $this->hasMany(ProductImage::class)->orderByDesc('is_primary')->orderBy('sort_order')->orderBy('id');
    }

    public function primaryImage(): HasOne
    {
        return $this->hasOne(ProductImage::class)->where('is_primary', true);
    }

    public function reviews(): HasMany
    {
        return $this->hasMany(Review::class);
    }

    public function inventoryLogs(): HasMany
    {
        return $this->hasMany(InventoryLog::class);
    }

    /** Recipe: ingredients used per unit sold (pivot `quantity`, in the ingredient's unit). */
    public function ingredients(): BelongsToMany
    {
        return $this->belongsToMany(Ingredient::class)->withPivot('quantity')->withTimestamps()->orderBy('name');
    }

    /**
     * Add-ons this product offers (deleted add-ons are excluded). Pivot `max_quantity` is how
     * many of that add-on one burger may take.
     */
    public function addons(): BelongsToMany
    {
        return $this->belongsToMany(Addon::class)
            ->withPivot('max_quantity', 'sort_order')
            ->withTimestamps()
            ->orderByPivot('sort_order')
            ->orderBy('addons.sort_order')
            ->orderBy('addons.name');
    }

    /** Products customers can see on the menu. */
    #[Scope]
    protected function available(Builder $query): void
    {
        $query->where('is_available', true);
    }

    #[Scope]
    protected function search(Builder $query, string $term): void
    {
        $like = '%'.addcslashes($term, '%_\\').'%';
        $query->where(fn (Builder $q) => $q->where('name', 'ilike', $like)->orWhere('description', 'ilike', $like));
    }

    #[Scope]
    protected function inCategory(Builder $query, string $slug): void
    {
        $query->whereHas('categories', fn (Builder $q) => $q->where('slug', $slug)->where('is_active', true));
    }

    /** Can be added to a cart right now (listed, not deleted, and in stock if stock is tracked). */
    public function isPurchasable(): bool
    {
        return $this->is_available && ! $this->trashed() && (! $this->track_stock || $this->stock_quantity > 0);
    }

    /** Largest quantity of this product one cart line may hold. */
    public function maxOrderableQuantity(): int
    {
        $cap = (int) config('restaurant.cart.max_quantity_per_item');

        return $this->track_stock ? max(0, min($cap, $this->stock_quantity)) : $cap;
    }

    /** @return 'unlimited'|'in_stock'|'low_stock'|'out_of_stock' */
    public function stockStatus(): string
    {
        return match (true) {
            ! $this->track_stock => 'unlimited',
            $this->stock_quantity <= 0 => 'out_of_stock',
            $this->stock_quantity <= $this->low_stock_threshold => 'low_stock',
            default => 'in_stock',
        };
    }
}
