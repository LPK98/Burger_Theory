<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\OrderStatus;
use App\Enums\PaymentStatus;
use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Http\Resources\AddressResource;
use App\Http\Resources\AdminCustomerResource;
use App\Models\Order;
use App\Models\User;
use App\Support\Money;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;

/**
 * @tags Admin · Customers
 */
class CustomerController extends Controller
{
    /**
     * Customer accounts with order counts and spending.
     *
     * Search matches name, email or phone. `sort`: newest (default), oldest, name, orders,
     * spent or last_order.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $v = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'sort' => ['nullable', 'in:newest,oldest,name,orders,spent,last_order'],
            /** 1: only customers who have ordered; 0: only those who never have. */
            'has_orders' => ['nullable', 'boolean'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $query = $this->withStats(User::query()->where('role', UserRole::Customer->value))
            ->when($v['search'] ?? null, function (Builder $q, string $term) {
                $like = '%'.addcslashes($term, '%_\\').'%';
                $q->where(fn (Builder $s) => $s->where('name', 'ilike', $like)->orWhere('email', 'ilike', $like)->orWhere('phone', 'ilike', $like));
            })
            ->when($request->has('has_orders'), fn (Builder $q) => $request->boolean('has_orders') ? $q->has('orders') : $q->doesntHave('orders'));

        match ($v['sort'] ?? 'newest') {
            'oldest' => $query->orderBy('id'),
            'name' => $query->orderBy('name')->orderBy('id'),
            'orders' => $query->orderByDesc('orders_count')->orderByDesc('id'),
            'spent' => $query->orderByDesc('total_spent')->orderByDesc('id'),
            'last_order' => $query->orderByRaw('last_order_at DESC NULLS LAST')->orderByDesc('id'),
            default => $query->orderByDesc('id'),
        };

        return AdminCustomerResource::collection($query->paginate((int) ($v['per_page'] ?? 20))->withQueryString());
    }

    /**
     * One customer: profile, order statistics, saved addresses and favourite products.
     *
     * Their full order history is `GET /admin/orders?customer_id={id}`.
     */
    public function show(int $customer): JsonResponse
    {
        $user = $this->withStats(User::query()->where('role', UserRole::Customer->value))->whereKey($customer)->firstOrFail();

        $orders = Order::query()->where('user_id', $user->id);
        $stats = $orders->clone()->toBase()
            ->selectRaw('COUNT(*) FILTER (WHERE status = ?) AS completed', [OrderStatus::Delivered->value])
            ->selectRaw('COUNT(*) FILTER (WHERE status IN (?, ?)) AS cancelled', OrderStatus::voidValues())
            ->selectRaw('COUNT(*) FILTER (WHERE payment_status = ? AND status NOT IN (?, ?)) AS paid', [PaymentStatus::Paid->value, ...OrderStatus::voidValues()])
            ->selectRaw('MIN(created_at) AS first_order_at')
            ->first();

        $favourites = DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('orders.user_id', $user->id)
            ->whereNotIn('orders.status', OrderStatus::voidValues())
            ->groupBy('order_items.product_name')
            ->selectRaw('order_items.product_name AS name, SUM(order_items.quantity) AS quantity')
            ->orderByDesc('quantity')
            ->limit(3)
            ->get()
            ->map(fn ($r) => ['name' => $r->name, 'quantity' => (int) $r->quantity]);

        $profile = (new AdminCustomerResource($user))->toArray(request());
        $paid = (int) $stats->paid;

        return response()->json(['data' => $profile + [
            'completed_orders' => (int) $stats->completed,
            'cancelled_orders' => (int) $stats->cancelled,
            'paid_orders' => $paid,
            'average_order_value' => $paid > 0 ? intdiv($profile['total_spent'], $paid) : 0,
            'first_order_at' => $stats->first_order_at ? \Carbon\CarbonImmutable::parse($stats->first_order_at)->toIso8601String() : null,
            'favourite_products' => $favourites,
            'addresses' => AddressResource::collection($user->addresses()->latest('is_default')->get()),
        ]]);
    }

    /** Adds orders_count, total_spent (revenue orders) and last_order_at to a users query. */
    private function withStats(Builder $query): Builder
    {
        return $query
            ->select('users.*')
            ->withCount('orders')
            ->selectSub(
                Order::query()->revenue()->whereColumn('orders.user_id', 'users.id')->selectRaw('COALESCE(SUM(total), 0)')->toBase(),
                'total_spent',
            )
            ->selectSub(
                Order::query()->whereColumn('orders.user_id', 'users.id')->selectRaw('MAX(created_at)')->toBase(),
                'last_order_at',
            );
    }
}
