<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Add-ons and extra toppings (extra cheese, bacon, sauces…), the products each one may be
 * added to, the add-ons chosen on a cart line, and a snapshot of them on every order item.
 *
 * "Variations" such as a double patty are add-ons too ("Extra beef patty"), so a line's price
 * is always: product price + Σ(add-on price × add-on quantity), per unit.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('addons', function (Blueprint $table) {
            $table->id();
            $table->string('slug', 80);
            $table->string('name', 80);
            $table->string('description', 255)->nullable();
            // topping | sauce | side | extra (see App\Enums\AddonKind)
            $table->string('kind', 20)->default('topping');
            // NUMERIC(10,2) in LKR, like products.price; the application works in integer cents.
            $table->decimal('price', 10, 2);
            $table->boolean('is_available')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestampsTz();
            $table->softDeletesTz();

            $table->index(['is_available', 'sort_order']);
        });

        DB::statement('CREATE UNIQUE INDEX addons_slug_unique ON addons (slug) WHERE deleted_at IS NULL');
        DB::statement('ALTER TABLE addons ADD CONSTRAINT addons_price_check CHECK (price >= 0)');
        DB::statement("ALTER TABLE addons ADD CONSTRAINT addons_kind_check CHECK (kind IN ('topping', 'sauce', 'side', 'extra'))");

        // Which add-ons each product offers, and how many of each one burger may take.
        Schema::create('addon_product', function (Blueprint $table) {
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('addon_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('max_quantity')->default(1);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestampsTz();

            $table->primary(['product_id', 'addon_id']);
            $table->index('addon_id');
        });

        DB::statement('ALTER TABLE addon_product ADD CONSTRAINT addon_product_max_quantity_check CHECK (max_quantity BETWEEN 1 AND 10)');

        // The same burger with different add-ons is a separate cart line, so a line is now
        // identified by (cart, product, options_key). options_key is the canonical list of the
        // line's add-ons ("3:1,7:2"); '' means no add-ons, which is what every existing line has.
        Schema::table('cart_items', function (Blueprint $table) {
            $table->string('options_key', 255)->default('');
        });
        Schema::table('cart_items', function (Blueprint $table) {
            $table->dropUnique(['cart_id', 'product_id']);
            $table->unique(['cart_id', 'product_id', 'options_key']);
        });

        Schema::create('cart_item_addons', function (Blueprint $table) {
            $table->foreignId('cart_item_id')->constrained()->cascadeOnDelete();
            $table->foreignId('addon_id')->constrained()->cascadeOnDelete();
            // Per burger on the line (2 = double extra cheese on each burger).
            $table->unsignedSmallInteger('quantity');

            $table->primary(['cart_item_id', 'addon_id']);
            $table->index('addon_id');
        });

        DB::statement('ALTER TABLE cart_item_addons ADD CONSTRAINT cart_item_addons_quantity_check CHECK (quantity > 0)');

        // unit_price stays "the price of one burger as ordered" (so line_total = unit_price × quantity
        // still holds and every report keeps working); addons_unit_price is the add-on part of it.
        Schema::table('order_items', function (Blueprint $table) {
            $table->decimal('addons_unit_price', 10, 2)->default(0);
        });

        DB::statement('ALTER TABLE order_items ADD CONSTRAINT order_items_addons_unit_price_check CHECK (addons_unit_price >= 0 AND addons_unit_price <= unit_price)');

        // Snapshot of each add-on as sold. Kept if the add-on is later deleted.
        Schema::create('order_item_addons', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_item_id')->constrained()->cascadeOnDelete();
            $table->foreignId('addon_id')->nullable()->constrained()->nullOnDelete();
            $table->string('addon_name', 80);
            $table->decimal('unit_price', 10, 2);
            // Per burger, like cart_item_addons.quantity.
            $table->unsignedSmallInteger('quantity');
            $table->timestampsTz();

            $table->index('order_item_id');
            $table->index('addon_id');
        });

        DB::statement('ALTER TABLE order_item_addons ADD CONSTRAINT order_item_addons_amounts_check CHECK (unit_price >= 0 AND quantity > 0)');
    }

    public function down(): void
    {
        Schema::dropIfExists('order_item_addons');

        DB::statement('ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_addons_unit_price_check');
        Schema::table('order_items', fn (Blueprint $table) => $table->dropColumn('addons_unit_price'));

        Schema::dropIfExists('cart_item_addons');

        // Lines that differ only by add-ons would break the old one-line-per-product rule.
        DB::table('cart_items')->where('options_key', '<>', '')->delete();
        Schema::table('cart_items', function (Blueprint $table) {
            $table->dropUnique(['cart_id', 'product_id', 'options_key']);
            $table->unique(['cart_id', 'product_id']);
        });
        Schema::table('cart_items', fn (Blueprint $table) => $table->dropColumn('options_key'));

        Schema::dropIfExists('addon_product');
        Schema::dropIfExists('addons');
    }
};
