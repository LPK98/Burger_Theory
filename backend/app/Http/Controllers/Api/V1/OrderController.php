<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use App\Http\Controllers\Controller;
use App\Http\Requests\Order\CancelOrderRequest;
use App\Http\Requests\Order\OrderIndexRequest;
use App\Http\Requests\Order\PlaceOrderRequest;
use App\Http\Resources\OrderResource;
use App\Models\Order;
use App\Services\Order\OrderPlacementService;
use App\Services\Order\OrderWorkflowService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

/**
 * @tags Orders
 */
class OrderController extends Controller
{
    private const RELATIONS = ['items', 'latestPayment', 'statusHistory'];

    /** Your order history, newest first. */
    public function index(OrderIndexRequest $request): AnonymousResourceCollection
    {
        $orders = $request->user()->orders()
            ->with(['items', 'latestPayment'])
            ->when($request->validated('status'), fn ($q, $status) => $q->where('status', $status))
            ->when($request->boolean('active'), fn ($q) => $q->whereNotIn('status', [
                OrderStatus::Delivered->value, OrderStatus::Cancelled->value, OrderStatus::Rejected->value,
            ]))
            ->latest('id')
            ->paginate((int) ($request->validated('per_page') ?? 10))
            ->withQueryString();

        return OrderResource::collection($orders);
    }

    /**
     * Place an order from your cart.
     *
     * Items, prices and totals come from your server-side cart, never from this request.
     * Send an `Idempotency-Key` header (e.g. a UUID per checkout attempt): repeating the
     * request with the same key returns the original order (200) instead of a new one (201).
     *
     * For `payhere`, continue with `POST /payments/payhere`; for `stripe`, with `POST /payments/stripe`.
     * For `cod`, the order is complete.
     */
    public function store(PlaceOrderRequest $request, OrderPlacementService $placement): JsonResponse
    {
        [$order, $created] = $placement->place($request->user(), $request->toData());

        return (new OrderResource($order->load(self::RELATIONS)))
            ->additional(['meta' => [
                'created' => $created,
                'next_action' => $order->isAwaitingOnlinePayment()
                    ? match ($order->payment_method) {
                        PaymentMethod::PayHere => 'payhere_checkout',
                        PaymentMethod::Stripe => 'stripe_checkout',
                        default => null,
                    }
                    : null,
            ]])
            ->response()
            ->setStatusCode($created ? 201 : 200);
    }

    /** Show one of your orders, with its status timeline (use for order tracking). */
    public function show(Order $order): OrderResource
    {
        Gate::authorize('view', $order);

        return new OrderResource($order->load(self::RELATIONS));
    }

    /**
     * Cancel an order.
     *
     * Only while it is still pending and unpaid; after that, call the restaurant.
     */
    public function cancel(CancelOrderRequest $request, Order $order, OrderWorkflowService $workflow): OrderResource
    {
        Gate::authorize('cancel', $order);

        $order = $workflow->cancelByCustomer($order, $request->user(), $request->validated('reason'));

        return new OrderResource($order->load(self::RELATIONS));
    }
}
