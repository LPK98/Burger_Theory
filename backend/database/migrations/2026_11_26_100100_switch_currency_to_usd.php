<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The restaurant now trades in USD (config/restaurant.php `currency`).
 *
 * This is a re-pricing, not an exchange-rate conversion: the storefront menu was always
 * priced in USD cents (1450 = $14.50) while the API stored the same numbers as rupees
 * (1450.00 = LKR 1,450). Dividing the stored amounts by 100 makes the API match the menu.
 *
 * Converted: product and add-on prices, coupon amounts/limits, and the money settings
 * (delivery fee, free-delivery threshold, minimum order). Orders and payments keep the
 * currency they were placed in, so the migration refuses to run while LKR orders exist,
 * rather than leaving a mix of currencies in the revenue figures.
 */
return new class extends Migration
{
    private const MONEY_SETTINGS = ['delivery_fee', 'free_delivery_threshold', 'minimum_order_amount'];

    /** Seeded coupon descriptions that name LKR amounts. Admin-written ones are left alone. */
    private const COUPON_TEXT = [
        'WELCOME10' => ['10% off your first order (max LKR 500)', '10% off your first order (max $5)'],
        'STACK300' => ['LKR 300 off orders over LKR 4,000', '$3 off orders over $40'],
        'BURGERWEEK' => ['Burger Week: 20% off any order (max LKR 800), twice per customer', 'Burger Week: 20% off any order (max $8), twice per customer'],
    ];

    public function up(): void
    {
        if (DB::table('orders')->where('currency', '!=', 'USD')->exists()) {
            throw new RuntimeException('Orders in another currency exist. Convert or archive them before switching the restaurant to USD.');
        }

        $this->scale('/ 100');

        foreach (self::COUPON_TEXT as $code => [$old, $new]) {
            DB::table('coupons')->where('code', $code)->where('description', $old)->update(['description' => $new]);
        }

        DB::statement("ALTER TABLE orders ALTER COLUMN currency SET DEFAULT 'USD'");
        DB::statement("ALTER TABLE payments ALTER COLUMN currency SET DEFAULT 'USD'");
    }

    public function down(): void
    {
        if (DB::table('orders')->where('currency', '!=', 'LKR')->exists()) {
            throw new RuntimeException('USD orders exist; switching back to LKR would mix currencies.');
        }

        $this->scale('* 100');

        foreach (self::COUPON_TEXT as $code => [$old, $new]) {
            DB::table('coupons')->where('code', $code)->where('description', $new)->update(['description' => $old]);
        }

        DB::statement("ALTER TABLE orders ALTER COLUMN currency SET DEFAULT 'LKR'");
        DB::statement("ALTER TABLE payments ALTER COLUMN currency SET DEFAULT 'LKR'");
    }

    /** @param  '/ 100'|'* 100'  $op */
    private function scale(string $op): void
    {
        // NUMERIC(10,2) columns, rounded half away from zero to the cent.
        DB::statement("UPDATE products SET price = round(price {$op}, 2), compare_at_price = round(compare_at_price {$op}, 2)");
        DB::statement("UPDATE addons SET price = round(price {$op}, 2)");
        DB::statement("UPDATE coupons SET amount = round(amount {$op}, 2), min_order_amount = round(min_order_amount {$op}, 2), max_discount_amount = round(max_discount_amount {$op}, 2)");

        // Settings are JSON integers in cents (null = disabled for the free-delivery threshold).
        foreach (self::MONEY_SETTINGS as $key) {
            DB::statement(
                "UPDATE restaurant_settings SET value = to_jsonb(round((value #>> '{}')::numeric {$op})::bigint) WHERE key = ? AND jsonb_typeof(value) = 'number'",
                [$key],
            );
        }
    }
};
