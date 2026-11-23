<?php

namespace App\Models;

use App\Casts\MoneyCast;
use App\Enums\PaymentMethod;
use App\Enums\PaymentStatus;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\RouteKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** @property int $amount Minor units (cents). */
#[Fillable([
    'order_id', 'method', 'status', 'amount', 'currency', 'reference', 'provider_payment_id', 'provider_status_code',
    'provider_status_message', 'provider_method', 'card_mask', 'collected_by_id', 'collected_at', 'paid_at',
    'provider_checkout_id', 'checkout_url', 'checkout_expires_at',
])]
#[RouteKey('reference')]
class Payment extends Model
{
    protected function casts(): array
    {
        return [
            'method' => PaymentMethod::class,
            'status' => PaymentStatus::class,
            'amount' => MoneyCast::class,
            'provider_status_code' => 'integer',
            'collected_at' => 'immutable_datetime',
            'paid_at' => 'immutable_datetime',
            'checkout_expires_at' => 'immutable_datetime',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function events(): HasMany
    {
        return $this->hasMany(PaymentEvent::class)->orderBy('id');
    }

    public function collectedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'collected_by_id')->withTrashed();
    }
}
