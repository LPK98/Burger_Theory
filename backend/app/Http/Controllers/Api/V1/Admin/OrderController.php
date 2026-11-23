<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\OrderActor;
use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\AdminOrderIndexRequest;
use App\Http\Requests\Admin\UpdateOrderStatusRequest;
use App\Http\Resources\AdminOrderResource;
use App\Models\Order;
use App\Services\Order\OrderWorkflowService;
use App\Services\Payment\CashOnDeliveryService;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * @tags Admin · Orders
 */
class OrderController extends Controller
{
    private const RELATIONS = ['items', 'payments', 'latestPayment', 'statusHistory.changedBy'];

    /** All orders, filterable by status, payment, date range and search. */
    public function index(AdminOrderIndexRequest $request): AnonymousResourceCollection
    {
        $tz = (string) config('restaurant.timezone');

        $orders = Order::query()
            ->with(['items', 'latestPayment'])
            ->when($request->validated('status'), fn (Builder $q, string $statuses) => $q->whereIn('status', array_map('trim', explode(',', $statuses))))
            ->when($request->validated('payment_status'), fn (Builder $q, $v) => $q->where('payment_status', $v))
            ->when($request->validated('payment_method'), fn (Builder $q, $v) => $q->where('payment_method', $v))
            ->when($request->validated('fulfilment_type'), fn (Builder $q, $v) => $q->where('fulfilment_type', $v))
            ->when($request->validated('customer_id'), fn (Builder $q, $v) => $q->where('user_id', $v))
            ->when($request->validated('date_from'), fn (Builder $q, $d) => $q->where('created_at', '>=', CarbonImmutable::createFromFormat('Y-m-d', $d, $tz)->startOfDay()->utc()))
            ->when($request->validated('date_to'), fn (Builder $q, $d) => $q->where('created_at', '<', CarbonImmutable::createFromFormat('Y-m-d', $d, $tz)->startOfDay()->addDay()->utc()))
            ->when($request->validated('search'), function (Builder $q, string $term) {
                $like = '%'.addcslashes($term, '%_\\').'%';
                $q->where(fn (Builder $s) => $s->where('order_number', 'ilike', $like)
                    ->orWhere('customer_name', 'ilike', $like)
                    ->orWhere('customer_email', 'ilike', $like)
                    ->orWhere('customer_phone', 'ilike', $like));
            });

        match ($request->validated('sort') ?? 'newest') {
            'oldest' => $orders->orderBy('id'),
            'total' => $orders->orderBy('total')->orderByDesc('id'),
            '-total' => $orders->orderByDesc('total')->orderByDesc('id'),
            default => $orders->orderByDesc('id'),
        };

        return AdminOrderResource::collection(
            $orders->paginate((int) ($request->validated('per_page') ?? 20))->withQueryString()
        );
    }

    public function show(Order $order): AdminOrderResource
    {
        return new AdminOrderResource($order->load(self::RELATIONS));
    }

    /**
     * Move an order to its next status: confirm, prepare, ready, out for delivery,
     * delivered, or reject/cancel (with a `note`).
     *
     * Invalid moves return 409 with the allowed next statuses. PayHere orders cannot be
     * confirmed before their payment is verified.
     */
    public function updateStatus(UpdateOrderStatusRequest $request, Order $order, OrderWorkflowService $workflow): AdminOrderResource
    {
        $order = $workflow->transition(
            $order,
            OrderStatus::from($request->validated('status')),
            OrderActor::Admin,
            $request->user(),
            $request->validated('note'),
        );

        return new AdminOrderResource($order->load(self::RELATIONS));
    }

    /**
     * Record cash collected for a cash-on-delivery order.
     *
     * Allowed once the order is ready, out for delivery or delivered.
     */
    public function collectCash(Order $order, CashOnDeliveryService $cod): AdminOrderResource
    {
        $cod->markCollected($order, request()->user());

        return new AdminOrderResource($order->refresh()->load(self::RELATIONS));
    }
}
