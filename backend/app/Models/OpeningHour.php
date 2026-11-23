<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

/**
 * One day of the regular week (day_of_week 1 = Monday … 7 = Sunday). Times are wall-clock
 * times in the restaurant timezone; closes_at earlier than opens_at means after midnight.
 * Read through App\Services\Hours\OpeningHoursService.
 *
 * @property int $day_of_week
 * @property bool $is_open
 * @property string|null $opens_at
 * @property string|null $closes_at
 */
#[Fillable(['day_of_week', 'is_open', 'opens_at', 'closes_at', 'updated_by_id'])]
class OpeningHour extends Model
{
    protected function casts(): array
    {
        return [
            'day_of_week' => 'integer',
            'is_open' => 'boolean',
        ];
    }
}
