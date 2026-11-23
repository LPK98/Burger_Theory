<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * A date range (inclusive) that replaces the regular week: closed, or open with special hours.
 * Ranges never overlap (database exclusion constraint).
 *
 * @property int $id
 * @property CarbonImmutable $starts_on
 * @property CarbonImmutable $ends_on
 * @property bool $is_closed
 * @property string|null $opens_at
 * @property string|null $closes_at
 * @property string $title
 * @property string|null $note
 */
#[Fillable(['starts_on', 'ends_on', 'is_closed', 'opens_at', 'closes_at', 'title', 'note', 'created_by_id', 'updated_by_id'])]
class SpecialOpeningHour extends Model
{
    protected function casts(): array
    {
        return [
            'starts_on' => 'immutable_date',
            'ends_on' => 'immutable_date',
            'is_closed' => 'boolean',
        ];
    }

    /** Entries that cover any day between $from and $to (Y-m-d, inclusive). */
    public function scopeCovering(Builder $query, string $from, string $to): void
    {
        $query->whereDate('starts_on', '<=', $to)->whereDate('ends_on', '>=', $from);
    }
}
