<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->string('order_number', 30)->unique();
            // Orders are financial records: a customer with orders cannot be hard-deleted.
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->string('status', 30)->default('pending');
            $table->string('payment_method', 20);
            $table->string('payment_status', 20)->default('pending');
            $table->string('fulfilment_type', 20);
            $table->char('currency', 3)->default('LKR');

            $table->decimal('subtotal', 10, 2);
            $table->decimal('discount_total', 10, 2)->default(0);
            $table->decimal('delivery_fee', 10, 2)->default(0);
            $table->decimal('total', 10, 2);

            $table->foreignId('coupon_id')->nullable()->constrained()->nullOnDelete();
            $table->string('coupon_code', 40)->nullable();

            // Snapshot of who ordered and where it goes; later profile or address edits never change an order.
            $table->string('customer_name', 120);
            $table->string('customer_email');
            $table->string('customer_phone', 20);
            $table->string('delivery_recipient_name', 120)->nullable();
            $table->string('delivery_phone', 20)->nullable();
            $table->string('delivery_line1')->nullable();
            $table->string('delivery_line2')->nullable();
            $table->string('delivery_city', 100)->nullable();
            $table->string('delivery_postal_code', 20)->nullable();
            $table->string('delivery_instructions', 500)->nullable();
            $table->string('customer_notes', 500)->nullable();

            // Client-supplied Idempotency-Key: a retried checkout returns the original order.
            $table->string('idempotency_key', 100)->nullable();

            $table->timestampTz('estimated_ready_at')->nullable();
            $table->timestampTz('paid_at')->nullable();
            $table->timestampTz('delivered_at')->nullable();
            $table->timestampTz('cancelled_at')->nullable();
            $table->string('cancelled_by', 20)->nullable();
            $table->string('cancellation_reason', 500)->nullable();
            $table->timestampsTz();

            $table->unique(['user_id', 'idempotency_key']);
            $table->index(['user_id', 'created_at']);
            $table->index(['status', 'created_at']);
            $table->index(['payment_status', 'paid_at']);
            $table->index('created_at');
        });

        DB::statement("ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'rejected'))");
        DB::statement("ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('payhere', 'cod'))");
        DB::statement("ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check CHECK (payment_status IN ('pending', 'paid', 'failed', 'cancelled', 'charged_back', 'refund_required'))");
        DB::statement("ALTER TABLE orders ADD CONSTRAINT orders_fulfilment_type_check CHECK (fulfilment_type IN ('delivery', 'pickup'))");
        DB::statement('ALTER TABLE orders ADD CONSTRAINT orders_amounts_check CHECK (subtotal >= 0 AND discount_total >= 0 AND delivery_fee >= 0 AND discount_total <= subtotal AND total = subtotal - discount_total + delivery_fee)');
        DB::statement("ALTER TABLE orders ADD CONSTRAINT orders_delivery_address_check CHECK (fulfilment_type <> 'delivery' OR (delivery_line1 IS NOT NULL AND delivery_city IS NOT NULL))");

        Schema::create('order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            // Kept even if the product is later removed; the name and price are snapshots.
            $table->foreignId('product_id')->nullable()->constrained()->nullOnDelete();
            $table->string('product_name', 120);
            $table->string('product_slug', 120)->nullable();
            $table->decimal('unit_price', 10, 2);
            $table->integer('quantity');
            $table->decimal('line_total', 10, 2);
            $table->timestampsTz();

            $table->index('product_id');
        });

        DB::statement('ALTER TABLE order_items ADD CONSTRAINT order_items_quantity_check CHECK (quantity > 0)');
        DB::statement('ALTER TABLE order_items ADD CONSTRAINT order_items_line_total_check CHECK (unit_price >= 0 AND line_total = unit_price * quantity)');

        Schema::create('order_status_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->string('from_status', 30)->nullable();
            $table->string('to_status', 30);
            $table->string('actor_type', 20);
            $table->foreignId('changed_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('note', 500)->nullable();
            $table->timestampTz('created_at')->useCurrent();

            $table->index(['order_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_status_histories');
        Schema::dropIfExists('order_items');
        Schema::dropIfExists('orders');
    }
};
