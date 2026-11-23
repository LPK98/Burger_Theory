<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('coupons', function (Blueprint $table) {
            $table->id();
            // Stored upper-case; lookups normalise the submitted code.
            $table->string('code', 40);
            $table->string('description', 255)->nullable();
            $table->string('discount_type', 20);
            $table->unsignedSmallInteger('percentage')->nullable();
            $table->decimal('amount', 10, 2)->nullable();
            $table->decimal('max_discount_amount', 10, 2)->nullable();
            $table->decimal('min_order_amount', 10, 2)->nullable();
            $table->unsignedInteger('usage_limit')->nullable();
            $table->unsignedInteger('usage_limit_per_user')->nullable();
            $table->unsignedInteger('times_used')->default(0);
            $table->timestampTz('starts_at')->nullable();
            $table->timestampTz('expires_at')->nullable();
            $table->boolean('is_active')->default(true);
            // Public coupons are advertised through GET /offers.
            $table->boolean('is_public')->default(false);
            $table->timestampsTz();
            $table->softDeletesTz();

            $table->index(['is_active', 'is_public']);
        });

        DB::statement('CREATE UNIQUE INDEX coupons_code_unique ON coupons (code) WHERE deleted_at IS NULL');
        DB::statement("ALTER TABLE coupons ADD CONSTRAINT coupons_discount_check CHECK ((discount_type = 'percentage' AND percentage BETWEEN 1 AND 100 AND amount IS NULL) OR (discount_type = 'fixed' AND amount > 0 AND percentage IS NULL))");
        DB::statement('ALTER TABLE coupons ADD CONSTRAINT coupons_window_check CHECK (starts_at IS NULL OR expires_at IS NULL OR expires_at > starts_at)');
        DB::statement('ALTER TABLE coupons ADD CONSTRAINT coupons_times_used_check CHECK (times_used >= 0)');
    }

    public function down(): void
    {
        Schema::dropIfExists('coupons');
    }
};
