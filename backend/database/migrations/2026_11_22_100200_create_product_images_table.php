<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_images', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->string('url', 2048);
            // Cloudinary public_id; null for images hosted elsewhere (e.g. the frontend's seeded assets).
            $table->string('public_id')->nullable();
            $table->string('alt_text', 255)->nullable();
            $table->unsignedInteger('width')->nullable();
            $table->unsignedInteger('height')->nullable();
            $table->boolean('is_primary')->default(false);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestampsTz();

            $table->index(['product_id', 'sort_order']);
        });

        DB::statement('CREATE UNIQUE INDEX product_images_one_primary ON product_images (product_id) WHERE is_primary');
    }

    public function down(): void
    {
        Schema::dropIfExists('product_images');
    }
};
