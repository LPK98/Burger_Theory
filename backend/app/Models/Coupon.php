<?php

namespace App\Models;

use App\Casts\MoneyCast;
use App\Enums\DiscountType;
use Database\Factories\CouponFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * @property int|null $amount Fixed discount, minor units.
 * @property int|null $max_discount_amount Cap for percentage coupons, minor units.
 * @property int|null $min_order_amount Minimum subtotal, minor units.
 */
#[Fillable([
    'code', 'description', 'discount_type', 'percentage', 'amount', 'max_discount_amount', 'min_order_amount',
    'usage_limit', 'usage_limit_per_user', 'starts_at', 'expires_at', 'is_active', 'is_public',
])]
class Coupon extends Model
{
    /** @use HasFactory<CouponFactory> */
    use HasFactory, SoftDeletes;

    protected $attributes = [
        'times_used' => 0,
        'is_active' => true,
        'is_public' => false,
    ];

    protected function casts(): array
    {
        return [
            'discount_type' => DiscountType::class,
            'percentage' => 'integer',
            'amount' => MoneyCast::class,
            'max_discount_amount' => MoneyCast::class,
            'min_order_amount' => MoneyCast::class,
            'usage_limit' => 'integer',
            'usage_limit_per_user' => 'integer',
            'times_used' => 'integer',
            'starts_at' => 'immutable_datetime',
            'expires_at' => 'immutable_datetime',
            'is_active' => 'boolean',
            'is_public' => 'boolean',
        ];
    }

    protected function code(): Attribute
    {
        return Attribute::make(set: fn (string $value) => self::normalizeCode($value));
    }

    public static function normalizeCode(string $code): string
    {
        return mb_strtoupper(trim($code));
    }

    public function usages(): HasMany
    {
        return $this->hasMany(CouponUsage::class);
    }

    /** Active and inside its date window (usage limits are checked separately). */
    #[Scope]
    protected function current(Builder $query): void
    {
        $query->where('is_active', true)
            ->where(fn (Builder $q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', now()))
            ->where(fn (Builder $q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()));
    }
}
