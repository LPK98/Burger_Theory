<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\PaymentMethod;
use App\Enums\PaymentStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Payment\StartPayHereCheckoutRequest;
use App\Http\Requests\Payment\StripeOrderPaymentRequest;
use App\Http\Resources\OrderResource;
use App\Http\Resources\PaymentResource;
use App\Models\Order;
use App\Models\Payment;
use App\Services\Payment\NotificationOutcome;
use App\Services\Payment\PayHere\PayHereCheckoutService;
use App\Services\Payment\PayHere\PayHereNotificationHandler;
use App\Services\Payment\Stripe\StripeCheckoutService;
use App\Services\Payment\Stripe\StripePaymentHandler;
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

    /**
     * Start a Stripe checkout.
     *
     * Returns the URL of Stripe's hosted payment page for this order; send the browser there
     * (`window.location.assign(url)`). Card details are entered on Stripe, never on this site.
     * Calling this again returns the same page while it is open, or opens a new attempt after
     * a failed, cancelled or expired one.
     *
     * Stripe sends the shopper back to `STRIPE_SUCCESS_URL` / `STRIPE_CANCEL_URL` with
     * `order=<order_number>`. That redirect proves nothing: call `POST /payments/stripe/confirm`
     * or poll `GET /orders/{order}` for the real status.
     */
    public function startStripe(StripeOrderPaymentRequest $request, StripeCheckoutService $checkout): JsonResponse
    {
        $order = $this->ownOrder($request->validated('order_number'), 'pay');
        $result = $checkout->start($order);

        return response()->json(['data' => [
            'payment' => new PaymentResource($result['payment']),
            'url' => $result['url'],
            'expires_at' => $result['expires_at']->toIso8601String(),
            'test_mode' => $result['test_mode'],
        ]]);
    }

    /**
     * Confirm a Stripe checkout after the shopper returns.
     *
     * The server asks Stripe for the order's latest Checkout Session and applies it exactly as
     * the webhook would (idempotent; the webhook stays the source of truth). Use it on the
     * return page so the order updates at once, even before the webhook arrives.
     */
    public function confirmStripe(StripeOrderPaymentRequest $request, StripeCheckoutService $checkout, StripePaymentHandler $handler): OrderResource
    {
        $order = $this->ownOrder($request->validated('order_number'), 'view');

        if ($order->payment_method === PaymentMethod::Stripe && $order->payment_status !== PaymentStatus::Paid) {
            $session = $checkout->latestSession($order);
            if ($session !== null) {
                $handler->applySession($session, null, $request->ip());
            }
        }

        return new OrderResource($order->refresh()->load(['items', 'latestPayment', 'statusHistory']));
    }

    /**
     * Stripe webhook.
     *
     * Called by Stripe, not by the storefront. The raw body is verified against the
     * `Stripe-Signature` header with `STRIPE_WEBHOOK_SECRET`; 400 when that fails (Stripe
     * retries), 200 once the event is recorded (including repeats and ignored events).
     *
     * @unauthenticated
     */
    public function stripeWebhook(Request $request, StripePaymentHandler $handler): JsonResponse
    {
        $result = $handler->handleWebhook($request->getContent(), $request->header('Stripe-Signature'), $request->ip());

        $status = match (true) {
            $result['reason'] === 'webhook_not_configured' => 503,
            $result['reason'] === 'invalid_signature' => 400,
            default => 200,
        };

        return response()->json(['received' => $status === 200, 'outcome' => $result['outcome']->value], $status);
    }

    /** Payment status (yours, or any for admins). */
    public function show(Payment $payment): PaymentResource
    {
        $payment->load('order');
        Gate::authorize('view', $payment);

        return new PaymentResource($payment);
    }

    private function ownOrder(string $orderNumber, string $ability): Order
    {
        $order = Order::query()->where('order_number', $orderNumber)->first();
        abort_if($order === null, 404);
        Gate::authorize($ability, $order);

        return $order;
    }
}
