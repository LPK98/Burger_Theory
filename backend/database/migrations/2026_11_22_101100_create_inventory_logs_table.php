<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inventory_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->integer('change');
            $table->integer('quantity_before');
            $table->integer('quantity_after');
            $table->string('reason', 30);
            $table->string('note', 500)->nullable();
            $table->timestampTz('created_at')->useCurrent();

            $table->index(['product_id', 'created_at']);
            $table->index(['order_id', 'reason']);
        });

        DB::statement('ALTER TABLE inventory_logs ADD CONSTRAINT inventory_logs_change_check CHECK (change <> 0 AND quantity_after = quantity_before + change AND quantity_after >= 0)');
        DB::statement("ALTER TABLE inventory_logs ADD CONSTRAINT inventory_logs_reason_check CHECK (reason IN ('sale', 'order_release', 'restock', 'adjustment'))");
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_logs');
    }
};
