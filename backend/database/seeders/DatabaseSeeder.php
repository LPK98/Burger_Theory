<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Artisan;

class DatabaseSeeder extends Seeder
{
    /**
     * Safe to run more than once. Creates no default passwords: an administrator is only
     * created when SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are set in .env (or use
     * `php artisan app:create-admin`). Never put real credentials in those variables.
     */
    public function run(): void
    {
        $this->call([
            RestaurantSettingsSeeder::class,
            MenuSeeder::class,
            IngredientSeeder::class,
            AddonSeeder::class,
        ]);

        if (! app()->isProduction()) {
            $this->call(DemoCouponSeeder::class);
        }

        $email = env('SEED_ADMIN_EMAIL');
        $password = env('SEED_ADMIN_PASSWORD');
        if ($email && $password) {
            Artisan::call('app:create-admin', ['--name' => 'Administrator', '--email' => $email, '--password' => $password]);
            $this->command?->info(trim(Artisan::output()));
        }
    }
}
