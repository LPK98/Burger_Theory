<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Audit log of gateway callbacks (valid or not). */
#[Fillable(['payment_id', 'provider', 'reference', 'provider_status_code', 'signature_valid', 'outcome', 'outcome_reason', 'payload', 'ip_address'])]
class PaymentEvent extends Model
{
    public const UPDATED_AT = null;

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'signature_valid' => 'boolean',
            'provider_status_code' => 'integer',
            'created_at' => 'immutable_datetime',
        ];
    }

    public function payment(): BelongsTo
    {
        return $this->belongsTo(Payment::class);
    }
}
