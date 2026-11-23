<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One administrator action (append-only). Written by App\Services\Admin\ActivityLogger. */
#[Fillable(['user_id', 'action', 'method', 'path', 'subject_type', 'subject_id', 'status_code', 'properties', 'ip_address', 'user_agent'])]
class AdminActivityLog extends Model
{
    public const UPDATED_AT = null;

    protected function casts(): array
    {
        return [
            'properties' => 'array',
            'status_code' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class)->withTrashed();
    }
}
