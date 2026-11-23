<?php

namespace App\Models;

use App\Casts\MoneyCast;
use App\Enums\FulfilmentType;
use App\Enums\OrderActor;
use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use App\Enums\PaymentStatus;
use Database\Factories\OrderFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\RouteKey;
use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * Money attributes (subtotal, discount_total, delivery_fee, total) are integer minor units.
 */
#[Fillable([
    'order_number', 'user_id', 'status', 'payment_method', 'payment_status', 'fulfilment_type', 'currency',
    'subtotal', 'discount_total', 'delivery_fee', 'total', 'coupon_id', 'coupon_code',
    'customer_name', 'customer_email', 'customer_phone',
    'delivery_recipient_name', 'delivery_phone', 'delivery_line1', 'delivery_line2', 'delivery_city',
    'delivery_postal_code', 'delivery_instructions', 'customer_notes', 'idempotency_key',
    'estimated_ready_at', 'paid_at', 'delivered_at', 'cancelled_at', 'cancelled_by', 'cancellation_reason',
])]
#[RouteKey('order_number')]
class Order extends Model
{
    /** @use HasFactory<OrderFactory> */
    use HasFactory;

    protected function casts(): array
    {
        return [
            'status' => OrderStatus::class,
            'payment_method' => PaymentMethod::class,
            'payment_status' => PaymentStatus::class,
            'fulfilment_type' => FulfilmentType::class,
            'cancelled_by' => OrderActor::class,
            'subtotal' => MoneyCast::class,
            'discount_total' => MoneyCast::class,
            'delivery_fee' => MoneyCast::class,
            'total' => MoneyCast::class,
            'estimated_ready_at' => 'immutable_datetime',
            'paid_at' => 'immutable_datetime',
            'delivered_at' => 'immutable_datetime',
            'cancelled_at' => 'immutable_datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class)->withTrashed();
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class)->orderBy('id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class)->orderBy('id');
    }

    public function latestPayment(): HasOne
    {
        return $this->hasOne(Payment::class)->latestOfMany();
    }

    public function statusHistory(): HasMany
    {
        return $this->hasMany(OrderStatusHistory::class)->orderBy('created_at')->orderBy('id');
    }

    public function coupon(): BelongsTo
    {
        return $this->belongsTo(Coupon::class)->withTrashed();
    }

    /** Orders whose money counts as revenue: paid and not voided. */
    #[Scope]
    protected function revenue(Builder $query): void
    {
        $query->where('payment_status', PaymentStatus::Paid->value)
            ->whereNotIn('status', OrderStatus::voidValues());
    }

    public function isCancellableByCustomer(): bool
    {
        return $this->status->isCancellableByCustomer() && $this->payment_status !== PaymentStatus::Paid;
    }

    public function isAwaitingOnlinePayment(): bool
    {
        return $this->payment_method === PaymentMethod::PayHere
            && $this->status === OrderStatus::Pending
            && $this->payment_status !== PaymentStatus::Paid;
    }
}
