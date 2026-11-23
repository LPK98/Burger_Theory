<?php

namespace Database\Seeders;

use App\Models\RestaurantSetting;
use App\Services\Settings\RestaurantSettings;
use Illuminate\Database\Seeder;

/** Writes config('restaurant.defaults') as rows, without overwriting values an admin already changed. */
class RestaurantSettingsSeeder extends Seeder
{
    public function run(): void
    {
        foreach (array_keys(RestaurantSettings::SCHEMA) as $key) {
            RestaurantSetting::query()->firstOrCreate(['key' => $key], ['value' => config("restaurant.defaults.{$key}")]);
        }
    }
}
