<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

/** Raw key/value rows. Read and write them through App\Services\Settings\RestaurantSettings. */
#[Fillable(['key', 'value', 'updated_by_id'])]
class RestaurantSetting extends Model
{
    protected function casts(): array
    {
        return [
            'value' => 'json',
        ];
    }
}
