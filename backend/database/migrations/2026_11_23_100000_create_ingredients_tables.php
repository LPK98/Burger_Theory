<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Kitchen ingredients, their stock movements, and the recipe linking products to them.
 *
 * Product stock (products.stock_quantity, inventory_logs) stays as it is: it caps how many
 * of a burger can be sold. Ingredient stock is the kitchen's raw-material count. It is
 * consumed automatically by placed orders through each product's recipe, and returned when
 * an order is cancelled or rejected. It never blocks an order: a count that goes below zero
 * means the physical stock and the records disagree, and the admin portal flags it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ingredients', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            // g, kg, ml, l or pcs (see App\Enums\IngredientUnit).
            $table->string('unit', 10);
            $table->decimal('stock_quantity', 12, 3)->default(0);
            // At or below this level the ingredient is reported as low stock.
            $table->decimal('min_stock_level', 12, 3)->default(0);
            $table->string('notes', 500)->nullable();
            $table->timestampsTz();
            $table->softDeletesTz();
        });

        // One live ingredient per name, case-insensitively.
        DB::statement('CREATE UNIQUE INDEX ingredients_name_unique ON ingredients (lower(name)) WHERE deleted_at IS NULL');
        DB::statement("ALTER TABLE ingredients ADD CONSTRAINT ingredients_unit_check CHECK (unit IN ('g', 'kg', 'ml', 'l', 'pcs'))");
        DB::statement('ALTER TABLE ingredients ADD CONSTRAINT ingredients_min_stock_check CHECK (min_stock_level >= 0)');

        Schema::create('ingredient_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ingredient_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('change', 12, 3);
            $table->decimal('quantity_before', 12, 3);
            $table->decimal('quantity_after', 12, 3);
            $table->string('reason', 30);
            $table->string('note', 500)->nullable();
            $table->timestampTz('created_at')->useCurrent();

            $table->index(['ingredient_id', 'created_at']);
            $table->index(['order_id', 'reason']);
            $table->index(['reason', 'created_at']);
        });

        DB::statement('ALTER TABLE ingredient_movements ADD CONSTRAINT ingredient_movements_change_check CHECK (change <> 0 AND quantity_after = quantity_before + change)');
        DB::statement("ALTER TABLE ingredient_movements ADD CONSTRAINT ingredient_movements_reason_check CHECK (reason IN ('consumption', 'order_release', 'restock', 'adjustment', 'waste'))");

        // Recipe: how much of each ingredient one unit of the product uses.
        Schema::create('ingredient_product', function (Blueprint $table) {
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('ingredient_id')->constrained()->cascadeOnDelete();
            $table->decimal('quantity', 10, 3);
            $table->timestampsTz();

            $table->primary(['product_id', 'ingredient_id']);
            $table->index('ingredient_id');
        });

        DB::statement('ALTER TABLE ingredient_product ADD CONSTRAINT ingredient_product_quantity_check CHECK (quantity > 0)');
    }

    public function down(): void
    {
        Schema::dropIfExists('ingredient_product');
        Schema::dropIfExists('ingredient_movements');
        Schema::dropIfExists('ingredients');
    }
};
