<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Stripe Checkout as a third payment method, next to PayHere and cash on delivery.
 *
 * Each Stripe payment attempt owns exactly one Checkout Session. Its id is kept so the
 * webhook and the return page can only ever settle the session this server created.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE orders DROP CONSTRAINT orders_payment_method_check');
        DB::statement("ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('payhere', 'stripe', 'cod'))");
        DB::statement('ALTER TABLE payments DROP CONSTRAINT payments_method_check');
        DB::statement("ALTER TABLE payments ADD CONSTRAINT payments_method_check CHECK (method IN ('payhere', 'stripe', 'cod'))");

        Schema::table('payments', function (Blueprint $table) {
            // Stripe Checkout Session id (cs_test_… / cs_live_…, up to ~70 characters).
            $table->string('provider_checkout_id')->nullable()->unique();
            // Hosted payment page for that session, reused while it is still open.
            $table->text('checkout_url')->nullable();
            $table->timestampTz('checkout_expires_at')->nullable();
        });

        Schema::table('payment_events', function (Blueprint $table) {
            // Stripe event id (evt_…). PayHere notifications have none.
            $table->string('provider_event_id')->nullable()->index();
        });
    }

    public function down(): void
    {
        Schema::table('payment_events', function (Blueprint $table) {
            $table->dropColumn('provider_event_id');
        });

        Schema::table('payments', function (Blueprint $table) {
            $table->dropColumn(['provider_checkout_id', 'checkout_url', 'checkout_expires_at']);
        });

        DB::statement('ALTER TABLE payments DROP CONSTRAINT payments_method_check');
        DB::statement("ALTER TABLE payments ADD CONSTRAINT payments_method_check CHECK (method IN ('payhere', 'cod'))");
        DB::statement('ALTER TABLE orders DROP CONSTRAINT orders_payment_method_check');
        DB::statement("ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('payhere', 'cod'))");
    }
};
