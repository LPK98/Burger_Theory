<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Key/value store for settings an administrator changes at runtime. The set of
        // keys and their types is fixed in App\Services\Settings\RestaurantSettings.
        Schema::create('restaurant_settings', function (Blueprint $table) {
            $table->id();
            $table->string('key', 80)->unique();
            $table->jsonb('value')->nullable();
            $table->foreignId('updated_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampsTz();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('restaurant_settings');
    }
};
