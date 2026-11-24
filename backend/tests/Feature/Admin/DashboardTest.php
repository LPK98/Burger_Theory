<?php

namespace Tests\Feature\Admin;

use App\Enums\OrderStatus;
use App\Enums\PaymentStatus;
use App\Models\Order;
use App\Models\Product;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DashboardTest extends TestCase
{
    use RefreshDatabase;

    public function test_revenue_counts_only_paid_orders_that_were_not_voided(): void
    {
        $classic = Product::factory()->price(145000)->create(['name' => 'Classic']);
        $stack = Product::factory()->price(210000)->create(['name' => 'Stack']);

        // Counted: PayHere paid, and COD collected.
        Order::factory()->payhere()->paid()->status(OrderStatus::Delivered)->withItem($classic, 2)->create(); // 290,000
        Order::factory()->paid()->status(OrderStatus::Delivered)->withItem($stack, 1)->create();              // 210,000
        // Not counted: unpaid COD, unpaid PayHere, a paid order later cancelled, a refund case.
        Order::factory()->status(OrderStatus::Delivered)->withItem($stack, 5)->create();
        Order::factory()->payhere()->withItem($classic, 3)->create();
        Order::factory()->paid()->status(OrderStatus::Cancelled)->withItem($stack, 4)->create();
        Order::factory()->payhere()->status(OrderStatus::Cancelled)->withItem($classic, 1)->create(['payment_status' => PaymentStatus::RefundRequired]);

        $this->customer();
        $this->admin();

        $response = $this->getJson('/api/v1/admin/dashboard', $this->bearer($this->admin()))->assertOk();

        $response->assertJsonPath('data.currency', 'USD')
            ->assertJsonPath('data.total_revenue', 500000)
            ->assertJsonPath('data.paid_orders', 2)
            ->assertJsonPath('data.total_orders', 6)
            ->assertJsonPath('data.pending_orders', 1)
            ->assertJsonPath('data.completed_orders', 3)
            ->assertJsonPath('data.cancelled_orders', 2)
            ->assertJsonPath('data.unpaid_cod_orders', 1)
            ->assertJsonPath('data.refunds_required', 1)
            ->assertJsonPath('data.best_sellers.0.name', 'Classic')
            ->assertJsonPath('data.best_sellers.0.quantity_sold', 2)
            ->assertJsonPath('data.best_sellers.0.revenue', 290000)
            ->assertJsonPath('data.best_sellers.1.name', 'Stack')
            ->assertJsonCount(2, 'data.best_sellers')
            ->assertJsonCount(6, 'data.recent_orders');

        // 6 order owners + 1 explicit customer; admins are not customers.
        $this->assertSame(7, $response->json('data.total_customers'));
    }

    public function test_product_availability_summary(): void
    {
        Product::factory()->stock(50)->create();
        Product::factory()->stock(3)->create();
        Product::factory()->stock(0)->create();
        Product::factory()->untracked()->unavailable()->create();

        $this->getJson('/api/v1/admin/dashboard', $this->bearer($this->admin()))
            ->assertJsonPath('data.product_availability', ['total' => 4, 'available' => 3, 'unavailable' => 1, 'out_of_stock' => 1, 'low_stock' => 1])
            ->assertJsonCount(2, 'data.low_stock_products');
    }

    public function test_daily_sales_are_bucketed_in_the_restaurant_timezone(): void
    {
        $tz = 'Asia/Colombo';
        // 23:45 local on 20 Nov is 18:15 UTC on 20 Nov; 00:15 local on 21 Nov is 18:45 UTC on 20 Nov.
        Order::factory()->paid(CarbonImmutable::parse('2026-11-20 23:45', $tz)->utc())->total(100000)->create();
        Order::factory()->paid(CarbonImmutable::parse('2026-11-21 00:15', $tz)->utc())->total(250000)->create();
        Order::factory()->paid(CarbonImmutable::parse('2026-11-21 12:00', $tz)->utc())->total(50000)->create();
        Order::factory()->total(999900)->create(); // unpaid

        $response = $this->getJson('/api/v1/admin/dashboard/sales?interval=day&from=2026-11-19&to=2026-11-21', $this->bearer($this->admin()))
            ->assertOk();

        // `placed` counts by placement date; these orders were all placed "now", outside the range.
        $this->assertSame([
            ['period' => '2026-11-19', 'orders' => 0, 'revenue' => 0, 'discounts' => 0, 'placed' => 0, 'cancelled' => 0],
            ['period' => '2026-11-20', 'orders' => 1, 'revenue' => 100000, 'discounts' => 0, 'placed' => 0, 'cancelled' => 0],
            ['period' => '2026-11-21', 'orders' => 2, 'revenue' => 300000, 'discounts' => 0, 'placed' => 0, 'cancelled' => 0],
        ], $response->json('data.series'));
        $response->assertJsonPath('data.totals.revenue', 400000)->assertJsonPath('data.timezone', $tz);
    }

    public function test_monthly_sales(): void
    {
        $tz = 'Asia/Colombo';
        Order::factory()->paid(CarbonImmutable::parse('2026-09-30 23:59', $tz)->utc())->total(100000)->create();
        Order::factory()->paid(CarbonImmutable::parse('2026-11-01 00:01', $tz)->utc())->total(200000)->create();

        $series = $this->getJson('/api/v1/admin/dashboard/sales?interval=month&from=2026-09-01&to=2026-11-30', $this->bearer($this->admin()))
            ->assertOk()->json('data.series');

        $this->assertSame(['2026-09', '2026-10', '2026-11'], array_column($series, 'period'));
        $this->assertSame([100000, 0, 200000], array_column($series, 'revenue'));
    }

    public function test_sales_range_is_validated(): void
    {
        $headers = $this->bearer($this->admin());
        $this->getJson('/api/v1/admin/dashboard/sales?from=2024-01-01&to=2026-11-01', $headers)->assertUnprocessable();
        $this->getJson('/api/v1/admin/dashboard/sales?interval=year', $headers)->assertUnprocessable();
        $this->getJson('/api/v1/admin/dashboard/sales?interval=week&from=2020-01-01&to=2026-11-01', $headers)->assertUnprocessable();
        $this->getJson('/api/v1/admin/dashboard/sales?interval=week', $headers)->assertOk()->assertJsonCount(12, 'data.series');
        $this->getJson('/api/v1/admin/dashboard/sales', $headers)->assertOk()->assertJsonCount(30, 'data.series');
    }
}
