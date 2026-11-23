<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Payment\StartPayHereCheckoutRequest;
use App\Http\Resources\PaymentResource;
use App\Models\Order;
use App\Models\Payment;
use App\Services\Payment\PayHere\NotificationOutcome;
use App\Services\Payment\PayHere\PayHereCheckoutService;
use App\Services\Payment\PayHere\PayHereNotificationHandler;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

/**
 * @tags Payments
 */
class PaymentController extends Controller
{
    /**
     * Start a PayHere checkout.
     *
     * Returns the signed fields to POST to `action_url` (a form submit, or `payhere.startPayment`
     * from payhere.js). The merchant secret is never returned. Calling this again reuses the
     * pending attempt, or opens a new one after a failed/cancelled payment.
     *
     * This does not mark anything as paid. Only PayHere's verified server notification does;
     * poll `GET /orders/{order}` or `GET /payments/{payment}` after the shopper returns.
     */
    public function startPayHere(StartPayHereCheckoutRequest $request, PayHereCheckoutService $checkout): JsonResponse
    {
        $order = Order::query()->where('order_number', $request->validated('order_number'))->first();
        abort_if($order === null, 404);
        Gate::authorize('pay', $order);

        $result = $checkout->start($order);

        return response()->json(['data' => [
            'payment' => new PaymentResource($result['payment']),
            'action_url' => $result['action_url'],
            'method' => $result['method'],
            'sandbox' => $result['sandbox'],
            'fields' => $result['fields'],
        ]]);
    }

    /**
     * PayHere server notification (notify_url).
     *
     * Called by PayHere, not by the storefront. Form-encoded. Verified with md5sig, then
     * applied idempotently. Answers 200 `OK` when accepted (including repeats) and 400 when
     * verification fails.
     *
     * @unauthenticated
     */
    public function payHereNotify(Request $request, PayHereNotificationHandler $handler): Response
    {
        $result = $handler->handle($request->post(), $request->ip());
        $rejected = $result['outcome'] === NotificationOutcome::Rejected;

        return response($rejected ? 'REJECTED' : 'OK', $rejected ? 400 : 200)->header('Content-Type', 'text/plain');
    }

    /** Payment status (yours, or any for admins). */
    public function show(Payment $payment): PaymentResource
    {
        $payment->load('order');
        Gate::authorize('view', $payment);

        return new PaymentResource($payment);
    }
}
