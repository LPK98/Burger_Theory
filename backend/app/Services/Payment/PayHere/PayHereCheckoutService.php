<?php

namespace App\Services\Payment\PayHere;

use App\Enums\FulfilmentType;
use App\Enums\PaymentMethod;
use App\Enums\PaymentStatus;
use App\Exceptions\PaymentException;
use App\Models\Order;
use App\Models\Payment;
use App\Support\Money;
use Illuminate\Support\Facades\DB;

/**
 * Prepares the signed form the browser posts to PayHere. The response contains the hash,
 * never the merchant secret. Nothing here marks anything as paid: only a verified
 * server notification does that (PayHereNotificationHandler).
 */
class PayHereCheckoutService
{
    public function __construct(private readonly PayHereConfig $config) {}

    /**
     * @return array{payment: Payment, action_url: string, method: string, sandbox: bool, fields: array<string, string>}
     */
    public function start(Order $order): array
    {
        if (! $this->config->isConfigured()) {
            throw PaymentException::gatewayNotConfigured();
        }

        $payment = DB::transaction(function () use ($order) {
            $locked = Order::query()->whereKey($order->id)->lockForUpdate()->firstOrFail();

            if ($locked->payment_method !== PaymentMethod::PayHere) {
                throw PaymentException::notPayable('This order is not paid online.');
            }
            if ($locked->payment_status === PaymentStatus::Paid) {
                throw PaymentException::alreadySettled();
            }
            if (! $locked->isAwaitingOnlinePayment()) {
                throw PaymentException::notPayable('This order can no longer be paid.');
            }

            $latest = $locked->payments()->where('method', PaymentMethod::PayHere->value)->reorder()->orderByDesc('id')->first();

            if ($latest !== null && $latest->status === PaymentStatus::Pending) {
                return $latest;
            }
            if ($latest !== null && ! $latest->status->allowsRetry()) {
                throw PaymentException::notPayable('This order can no longer be paid.');
            }

            // Failed or cancelled before: open a fresh attempt with its own PayHere order_id.
            $attempt = $locked->payments()->count() + 1;
            $payment = $locked->payments()->create([
                'method' => PaymentMethod::PayHere,
                'status' => PaymentStatus::Pending,
                'amount' => $locked->total,
                'currency' => $locked->currency,
                'reference' => "{$locked->order_number}-{$attempt}",
            ]);
            $locked->update(['payment_status' => PaymentStatus::Pending]);

            return $payment;
        });

        $order->refresh();

        return [
            'payment' => $payment,
            'action_url' => $this->config->checkoutUrl(),
            'method' => 'POST',
            'sandbox' => $this->config->isSandbox(),
            'fields' => $this->fields($order, $payment),
        ];
    }

    /** @return array<string, string> */
    private function fields(Order $order, Payment $payment): array
    {
        [$firstName, $lastName] = $this->splitName($order->customer_name);
        $isDelivery = $order->fulfilment_type === FulfilmentType::Delivery;
        $address = $isDelivery
            ? trim($order->delivery_line1.' '.($order->delivery_line2 ?? ''))
            : (string) config('restaurant.address.line1');
        $city = $isDelivery ? (string) $order->delivery_city : (string) config('restaurant.address.city');
        $amount = Money::toDecimal($payment->amount);

        $fields = [
            'merchant_id' => $this->config->merchantId(),
            'return_url' => $this->withOrder($this->config->returnUrl(), $order),
            'cancel_url' => $this->withOrder($this->config->cancelUrl(), $order),
            'notify_url' => $this->config->notifyUrl(),
            'order_id' => $payment->reference,
            'items' => config('restaurant.name').' order '.$order->order_number,
            'currency' => $payment->currency,
            'amount' => $amount,
            'first_name' => $this->clean($firstName),
            'last_name' => $this->clean($lastName),
            'email' => $order->customer_email,
            'phone' => $this->clean($order->customer_phone),
            'address' => $this->clean($address),
            'city' => $this->clean($city),
            'country' => (string) config('restaurant.country'),
            'custom_1' => $order->order_number,
            'hash' => PayHereSignature::checkoutHash(
                $this->config->merchantId(),
                $payment->reference,
                $payment->amount,
                $payment->currency,
                $this->config->merchantSecret(),
            ),
        ];

        if ($isDelivery) {
            $fields += [
                'delivery_address' => $fields['address'],
                'delivery_city' => $fields['city'],
                'delivery_country' => $fields['country'],
            ];
        }

        return $fields;
    }

    /** @return array{0: string, 1: string} */
    private function splitName(string $name): array
    {
        $parts = preg_split('/\s+/', trim($name), 2) ?: [];
        $first = $parts[0] ?? 'Customer';

        return [$first, $parts[1] ?? $first];
    }

    /** PayHere rejects emoji and markup in form values. */
    private function clean(string $value): string
    {
        $value = preg_replace('/[^\p{L}\p{N}\s.,\'\/#&()+\-]/u', '', $value) ?? '';

        return mb_substr(trim(preg_replace('/\s+/', ' ', $value) ?? ''), 0, 100);
    }

    private function withOrder(string $url, Order $order): string
    {
        return $url.(str_contains($url, '?') ? '&' : '?').'order='.urlencode($order->order_number);
    }
}
