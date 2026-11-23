<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // One row per payment attempt. A PayHere order can have several attempts
        // (a failed card then a retry); a COD order has exactly one.
        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->restrictOnDelete();
            $table->string('method', 20);
            $table->string('status', 20)->default('pending');
            $table->decimal('amount', 10, 2);
            $table->char('currency', 3)->default('LKR');
            // Our reference for the attempt; sent to PayHere as its order_id.
            $table->string('reference', 60)->unique();
            $table->string('provider_payment_id', 64)->nullable();
            $table->smallInteger('provider_status_code')->nullable();
            $table->string('provider_status_message')->nullable();
            $table->string('provider_method', 30)->nullable();
            // Masked by PayHere (e.g. ************4564). Full card data never reaches this system.
            $table->string('card_mask', 32)->nullable();
            $table->foreignId('collected_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('collected_at')->nullable();
            $table->timestampTz('paid_at')->nullable();
            $table->timestampsTz();

            $table->index(['order_id', 'status']);
            $table->unique(['method', 'provider_payment_id']);
        });

        DB::statement("ALTER TABLE payments ADD CONSTRAINT payments_method_check CHECK (method IN ('payhere', 'cod'))");
        DB::statement("ALTER TABLE payments ADD CONSTRAINT payments_status_check CHECK (status IN ('pending', 'paid', 'failed', 'cancelled', 'charged_back', 'refund_required'))");
        DB::statement('ALTER TABLE payments ADD CONSTRAINT payments_amount_check CHECK (amount >= 0)');
        // The database itself refuses a second successful payment for the same order.
        DB::statement("CREATE UNIQUE INDEX payments_one_paid_per_order ON payments (order_id) WHERE status = 'paid'");

        // Every gateway callback is logged, valid or not, for audit and debugging.
        Schema::create('payment_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('payment_id')->nullable()->constrained()->nullOnDelete();
            $table->string('provider', 20);
            $table->string('reference', 60)->nullable();
            $table->smallInteger('provider_status_code')->nullable();
            $table->boolean('signature_valid')->default(false);
            $table->string('outcome', 20);
            $table->string('outcome_reason')->nullable();
            $table->jsonb('payload');
            $table->string('ip_address', 45)->nullable();
            $table->timestampTz('created_at')->useCurrent();

            $table->index(['payment_id', 'created_at']);
            $table->index('reference');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_events');
        Schema::dropIfExists('payments');
    }
};
