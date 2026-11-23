<?php

namespace App\Services\Dashboard;

use App\Enums\OrderStatus;
use App\Enums\PaymentStatus;
use App\Enums\UserRole;
use App\Models\Ingredient;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use App\Support\Money;
use App\Support\Quantity;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Carbon\CarbonPeriod;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Sales figures straight from the database. Revenue counts only orders that are paid
 * (PayHere verified, or COD collected) and not cancelled or rejected.
 */
class DashboardService
{
    /** @return array<string, mixed> */
    public function summary(): array
    {
        $tz = (string) config('restaurant.timezone');
        $todayStart = CarbonImmutable::now($tz)->startOfDay()->utc();

        // toBase(): raw rows, so no model casts touch the aggregate.
        $statusCounts = Order::query()->toBase()
            ->selectRaw('status, COUNT(*) AS order_count')
            ->groupBy('status')
            ->pluck('order_count', 'status');

        $revenue = Order::query()->revenue();
        $todayRevenue = Order::query()->revenue()->where('paid_at', '>=', $todayStart);

        return [
            'currency' => config('restaurant.currency'),
            'total_revenue' => Money::toMinor((string) ($revenue->clone()->sum('total') ?: '0')),
            'paid_orders' => $revenue->clone()->count(),
            'today' => [
                'revenue' => Money::toMinor((string) ($todayRevenue->clone()->sum('total') ?: '0')),
                'paid_orders' => $todayRevenue->clone()->count(),
                'orders_placed' => Order::query()->where('created_at', '>=', $todayStart)->count(),
            ],
            'total_orders' => (int) $statusCounts->sum(),
            'pending_orders' => (int) ($statusCounts[OrderStatus::Pending->value] ?? 0),
            'active_orders' => (int) collect([OrderStatus::Confirmed, OrderStatus::Preparing, OrderStatus::Ready, OrderStatus::OutForDelivery])
                ->sum(fn (OrderStatus $s) => $statusCounts[$s->value] ?? 0),
            'completed_orders' => (int) ($statusCounts[OrderStatus::Delivered->value] ?? 0),
            'cancelled_orders' => (int) (($statusCounts[OrderStatus::Cancelled->value] ?? 0) + ($statusCounts[OrderStatus::Rejected->value] ?? 0)),
            'orders_by_status' => collect(OrderStatus::cases())->mapWithKeys(fn (OrderStatus $s) => [$s->value => (int) ($statusCounts[$s->value] ?? 0)]),
            'unpaid_cod_orders' => Order::query()
                ->where('payment_method', 'cod')
                ->where('payment_status', PaymentStatus::Pending->value)
                ->whereNotIn('status', OrderStatus::voidValues())
                ->count(),
            'refunds_required' => Order::query()->where('payment_status', PaymentStatus::RefundRequired->value)->count(),
            'total_customers' => User::query()->where('role', UserRole::Customer->value)->count(),
            'new_customers_today' => User::query()->where('role', UserRole::Customer->value)->where('created_at', '>=', $todayStart)->count(),
            'product_availability' => $this->productAvailability(),
            'best_sellers' => $this->bestSellers(5),
        ];
    }

    /** @return array<string, int> */
    public function productAvailability(): array
    {
        $row = DB::table('products')
            ->whereNull('deleted_at')
            ->selectRaw('COUNT(*) AS total')
            ->selectRaw('COUNT(*) FILTER (WHERE is_available) AS available')
            ->selectRaw('COUNT(*) FILTER (WHERE NOT is_available) AS unavailable')
            ->selectRaw('COUNT(*) FILTER (WHERE track_stock AND stock_quantity = 0) AS out_of_stock')
            ->selectRaw('COUNT(*) FILTER (WHERE track_stock AND stock_quantity > 0 AND stock_quantity <= low_stock_threshold) AS low_stock')
            ->first();

        return array_map('intval', (array) $row);
    }

    /**
     * Best sellers by quantity across revenue orders.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public function bestSellers(int $limit, ?CarbonImmutable $from = null, ?CarbonImmutable $to = null): Collection
    {
        return DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('orders.payment_status', PaymentStatus::Paid->value)
            ->whereNotIn('orders.status', OrderStatus::voidValues())
            ->when($from, fn ($q) => $q->where('orders.paid_at', '>=', $from->utc()))
            ->when($to, fn ($q) => $q->where('orders.paid_at', '<', $to->utc()))
            ->groupBy('order_items.product_id', 'order_items.product_name', 'order_items.product_slug')
            ->selectRaw('order_items.product_id, order_items.product_name, order_items.product_slug')
            ->selectRaw('SUM(order_items.quantity) AS quantity_sold, SUM(order_items.line_total) AS revenue, COUNT(DISTINCT orders.id) AS orders')
            ->orderByDesc('quantity_sold')
            ->orderBy('order_items.product_name')
            ->limit($limit)
            ->get()
            ->map(fn ($row) => [
                'product_id' => $row->product_id,
                'name' => $row->product_name,
                'slug' => $row->product_slug,
                'quantity_sold' => (int) $row->quantity_sold,
                'orders' => (int) $row->orders,
                'revenue' => Money::toMinor((string) $row->revenue),
            ]);
    }

    /**
     * Revenue and orders per day, ISO week (Monday start) or month in the restaurant's
     * timezone, with empty periods filled in.
     *
     * Per period: `orders` / `revenue` / `discounts` count paid revenue orders by payment
     * date; `placed` / `cancelled` count every order by the date it was placed.
     *
     * @return array{interval: string, from: string, to: string, timezone: string, currency: string, totals: array<string, int>, series: list<array<string, mixed>>}
     */
    public function sales(string $interval, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $tz = (string) config('restaurant.timezone');

        [$start, $endExclusive, $step, $keyFormat] = match ($interval) {
            'month' => [$from->startOfMonth(), $to->startOfMonth()->addMonth(), '1 month', 'Y-m'],
            'week' => [$from->startOfWeek(CarbonInterface::MONDAY), $to->startOfWeek(CarbonInterface::MONDAY)->addWeek(), '1 week', 'Y-m-d'],
            default => [$from->startOfDay(), $to->startOfDay()->addDay(), '1 day', 'Y-m-d'],
        };
        $bucket = fn (string $column) => match ($interval) {
            'month' => "to_char({$column} AT TIME ZONE ?, 'YYYY-MM')",
            'week' => "to_char(date_trunc('week', {$column} AT TIME ZONE ?), 'YYYY-MM-DD')",
            default => "to_char({$column} AT TIME ZONE ?, 'YYYY-MM-DD')",
        };

        $paid = Order::query()
            ->revenue()
            ->where('paid_at', '>=', $start->utc())
            ->where('paid_at', '<', $endExclusive->utc())
            ->selectRaw($bucket('paid_at').' AS period', [$tz])
            ->selectRaw('COUNT(*) AS orders, SUM(total) AS revenue, SUM(discount_total) AS discounts')
            ->groupBy('period')
            ->toBase()
            ->get()
            ->keyBy('period');

        $placed = Order::query()
            ->where('created_at', '>=', $start->utc())
            ->where('created_at', '<', $endExclusive->utc())
            ->selectRaw($bucket('created_at').' AS period', [$tz])
            ->selectRaw('COUNT(*) AS placed')
            ->selectRaw('COUNT(*) FILTER (WHERE status IN (?, ?)) AS cancelled', OrderStatus::voidValues())
            ->groupBy('period')
            ->toBase()
            ->get()
            ->keyBy('period');

        $series = [];
        foreach (CarbonPeriod::create($start, $step, $endExclusive->subSecond()) as $date) {
            $key = $date->format($keyFormat);
            $p = $paid->get($key);
            $o = $placed->get($key);
            $series[] = [
                'period' => $key,
                'orders' => (int) ($p->orders ?? 0),
                'revenue' => $p ? Money::toMinor((string) $p->revenue) : 0,
                'discounts' => $p ? Money::toMinor((string) $p->discounts) : 0,
                'placed' => (int) ($o->placed ?? 0),
                'cancelled' => (int) ($o->cancelled ?? 0),
            ];
        }

        return [
            'interval' => $interval,
            'from' => $start->toDateString(),
            'to' => $endExclusive->subDay()->toDateString(),
            'timezone' => $tz,
            'currency' => (string) config('restaurant.currency'),
            'totals' => [
                'orders' => array_sum(array_column($series, 'orders')),
                'revenue' => array_sum(array_column($series, 'revenue')),
                'discounts' => array_sum(array_column($series, 'discounts')),
                'placed' => array_sum(array_column($series, 'placed')),
                'cancelled' => array_sum(array_column($series, 'cancelled')),
            ],
            'series' => $series,
        ];
    }

    /**
     * Order statistics for orders placed in [from, toExclusive) (restaurant timezone dates).
     *
     * @return array<string, mixed>
     */
    public function orderStatistics(CarbonImmutable $from, CarbonImmutable $toExclusive): array
    {
        $tz = (string) config('restaurant.timezone');
        $placed = Order::query()
            ->where('created_at', '>=', $from->utc())
            ->where('created_at', '<', $toExclusive->utc());

        $count = fn (string $column) => $placed->clone()->toBase()
            ->selectRaw("{$column} AS k, COUNT(*) AS n")
            ->groupBy($column)
            ->pluck('n', 'k')
            ->map(fn ($n) => (int) $n);

        $byStatus = $count('status');
        $revenue = Order::query()->revenue()
            ->where('created_at', '>=', $from->utc())
            ->where('created_at', '<', $toExclusive->utc())
            ->toBase()
            ->selectRaw('COUNT(*) AS orders, COALESCE(SUM(total), 0) AS revenue, COALESCE(SUM(discount_total), 0) AS discounts, COALESCE(SUM(delivery_fee), 0) AS delivery_fees')
            ->first();

        $hours = $placed->clone()->toBase()
            ->selectRaw('EXTRACT(HOUR FROM created_at AT TIME ZONE ?)::int AS hour, COUNT(*) AS n', [$tz])
            ->groupBy('hour')
            ->pluck('n', 'hour');

        $total = (int) $byStatus->sum();
        $paidOrders = (int) $revenue->orders;
        $revenueMinor = Money::toMinor((string) $revenue->revenue);
        $voided = ($byStatus[OrderStatus::Cancelled->value] ?? 0) + ($byStatus[OrderStatus::Rejected->value] ?? 0);

        return [
            'from' => $from->toDateString(),
            'to' => $toExclusive->subDay()->toDateString(),
            'timezone' => $tz,
            'currency' => (string) config('restaurant.currency'),
            'orders_placed' => $total,
            'paid_orders' => $paidOrders,
            'revenue' => $revenueMinor,
            'discounts' => Money::toMinor((string) $revenue->discounts),
            'delivery_fees' => Money::toMinor((string) $revenue->delivery_fees),
            'average_order_value' => $paidOrders > 0 ? intdiv($revenueMinor, $paidOrders) : 0,
            'completed_orders' => (int) ($byStatus[OrderStatus::Delivered->value] ?? 0),
            'cancelled_orders' => (int) $voided,
            'cancellation_rate' => $total > 0 ? round($voided / $total, 4) : 0,
            'by_status' => collect(OrderStatus::cases())->mapWithKeys(fn (OrderStatus $s) => [$s->value => (int) ($byStatus[$s->value] ?? 0)]),
            'by_fulfilment' => $count('fulfilment_type'),
            'by_payment_method' => $count('payment_method'),
            'by_hour' => collect(range(0, 23))->map(fn (int $h) => ['hour' => $h, 'orders' => (int) ($hours[$h] ?? 0)])->all(),
        ];
    }

    /** @return Collection<int, Order> */
    public function recentOrders(int $limit): Collection
    {
        return Order::query()->with('user')->latest('id')->limit($limit)->get();
    }

    public function lowStockProducts(): Collection
    {
        return Product::query()
            ->where('track_stock', true)
            ->whereColumn('stock_quantity', '<=', 'low_stock_threshold')
            ->orderBy('stock_quantity')
            ->get(['id', 'slug', 'name', 'stock_quantity', 'low_stock_threshold', 'is_available']);
    }

    /** Ingredients at or below their minimum level, emptiest first. */
    public function lowStockIngredients(int $limit = 8): Collection
    {
        return Ingredient::query()
            ->lowStock()
            ->orderByRaw('stock_quantity - min_stock_level')
            ->limit($limit)
            ->get()
            ->map(fn (Ingredient $i) => [
                'id' => $i->id,
                'name' => $i->name,
                'unit' => $i->unit->value,
                'stock_quantity' => Quantity::toFloat($i->stock_quantity),
                'min_stock_level' => Quantity::toFloat($i->min_stock_level),
                'stock_status' => $i->stockStatus(),
            ]);
    }

    /**
     * Latest customer events: sign-ups, orders placed, and orders cancelled by customers.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public function recentActivity(int $limit = 10): Collection
    {
        $signups = User::query()
            ->where('role', UserRole::Customer->value)
            ->latest('id')->limit($limit)
            ->get(['id', 'name', 'created_at'])
            ->map(fn (User $u) => [
                'type' => 'signed_up',
                'customer_id' => $u->id,
                'customer_name' => $u->name,
                'order_number' => null,
                'amount' => null,
                'at' => $u->created_at,
            ]);

        $orders = Order::query()
            ->latest('id')->limit($limit)
            ->get(['id', 'user_id', 'order_number', 'customer_name', 'total', 'created_at'])
            ->map(fn (Order $o) => [
                'type' => 'placed_order',
                'customer_id' => $o->user_id,
                'customer_name' => $o->customer_name,
                'order_number' => $o->order_number,
                'amount' => $o->total,
                'at' => $o->created_at,
            ]);

        $cancellations = Order::query()
            ->where('cancelled_by', 'customer')
            ->latest('cancelled_at')->limit($limit)
            ->get(['id', 'user_id', 'order_number', 'customer_name', 'total', 'cancelled_at'])
            ->map(fn (Order $o) => [
                'type' => 'cancelled_order',
                'customer_id' => $o->user_id,
                'customer_name' => $o->customer_name,
                'order_number' => $o->order_number,
                'amount' => $o->total,
                'at' => $o->cancelled_at,
            ]);

        return $signups->concat($orders)->concat($cancellations)
            ->filter(fn (array $e) => $e['at'] !== null)
            ->sortByDesc(fn (array $e) => $e['at']->getTimestamp())
            ->take($limit)
            ->values()
            ->map(fn (array $e) => ['at' => $e['at']->toIso8601String()] + $e);
    }
}
