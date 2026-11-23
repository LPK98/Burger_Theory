<?php

namespace App\Services\Order;

use App\Enums\FulfilmentType;
use App\Enums\OrderActor;
use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use App\Enums\PaymentStatus;
use App\Exceptions\CartException;
use App\Exceptions\OrderException;
use App\Exceptions\PaymentException;
use App\Models\Address;
use App\Models\Cart;
use App\Models\Coupon;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Product;
use App\Models\User;
use App\Services\Cart\AddonSelection;
use App\Services\Cart\PricingService;
use App\Services\Coupon\CouponService;
use App\Services\Payment\PayHere\PayHereConfig;
use App\Services\Product\InventoryService;
use App\Services\Settings\RestaurantSettings;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Turns the customer's server-side cart into an order, in one transaction:
 * lock cart → lock products → re-validate availability, stock, add-ons, coupon and minimum →
 * price from the database → snapshot items, add-ons and address → take stock → record coupon use →
 * create the pending payment → empty the cart.
 */
class OrderPlacementService
{
    public function __construct(
        private readonly RestaurantSettings $settings,
        private readonly PricingService $pricing,
        private readonly CouponService $coupons,
        private readonly InventoryService $inventory,
        private readonly OrderNumberGenerator $numbers,
        private readonly OrderNotifier $notifier,
        private readonly PayHereConfig $payHere,
        private readonly AddonSelection $addons,
    ) {}

    /**
     * @return array{0: Order, 1: bool} The order, and whether it was created by this call
     *                                  (false when an Idempotency-Key matched an earlier order).
     */
    public function place(User $user, PlaceOrderData $data): array
    {
        $this->assertOrderingOpen($data);

        try {
            [$order, $created] = DB::transaction(fn () => $this->placeInTransaction($user, $data));
        } catch (UniqueConstraintViolationException $e) {
            // Two requests with the same Idempotency-Key raced; return the one that won.
            $existing = $data->idempotencyKey === null ? null : $this->findByIdempotencyKey($user, $data->idempotencyKey);
            if ($existing === null) {
                throw $e;
            }

            return [$existing, false];
        }

        if ($created) {
            $this->notifier->orderPlaced($order);
        }

        return [$order, $created];
    }

    /** @return array{0: Order, 1: bool} */
    private function placeInTransaction(User $user, PlaceOrderData $data): array
    {
        // The cart row lock serialises checkouts by the same customer (double clicks, retries).
        $cart = Cart::query()->where('user_id', $user->id)->lockForUpdate()->first();

        if ($data->idempotencyKey !== null && ($existing = $this->findByIdempotencyKey($user, $data->idempotencyKey))) {
            return [$existing, false];
        }

        $items = $cart?->items()->with('addons')->get() ?? collect();
        if ($items->isEmpty()) {
            throw CartException::empty();
        }

        // Lock in id order so concurrent orders for the same burgers cannot deadlock.
        $products = Product::withTrashed()
            ->whereIn('id', $items->pluck('product_id'))
            ->orderBy('id')
            ->lockForUpdate()
            ->get()
            ->load('addons')
            ->keyBy('id');

        // A product can be on several lines (with different add-ons); stock must cover them all.
        $wanted = $items->groupBy('product_id')->map(fn ($group) => (int) $group->sum('quantity'));

        $lines = [];
        $quoteLines = [];
        foreach ($items as $item) {
            $product = $products->get($item->product_id);
            if ($product === null || $product->trashed() || ! $product->is_available) {
                throw CartException::productUnavailable($product);
            }
            if ($product->track_stock && $product->stock_quantity < $wanted[$product->id]) {
                throw CartException::insufficientStock($product, $product->stock_quantity);
            }
            $selection = $this->addons->fromCartItem($item);
            if ($problem = $this->addons->problem($product, $selection)) {
                throw $problem;
            }
            $lines[] = ['product' => $product, 'quantity' => $item->quantity];
            $quoteLines[] = $this->pricing->line($product, $item->quantity, $selection);
        }

        $subtotal = $this->pricing->subtotal($quoteLines);
        if ($subtotal < $this->settings->minimumOrderAmount()) {
            throw OrderException::belowMinimum($this->settings->minimumOrderAmount());
        }

        $coupon = $cart->coupon_id === null ? null : Coupon::withTrashed()->whereKey($cart->coupon_id)->lockForUpdate()->first();
        $discount = 0;
        if ($coupon !== null) {
            $this->coupons->assertUsable($coupon, $subtotal, $user);
            $discount = $this->coupons->discountFor($coupon, $subtotal);
        }

        $deliveryFee = $this->pricing->deliveryFee($data->fulfilment, $subtotal - $discount);
        $total = $subtotal - $discount + $deliveryFee;

        if ($data->paymentMethod === PaymentMethod::PayHere && $total <= 0) {
            throw OrderException::onlinePaymentNeedsAmount();
        }

        $delivery = $this->deliverySnapshot($user, $data);
        $phone = $data->contactPhone ?? ($delivery['delivery_phone'] ?? null) ?? $user->phone;
        if ($phone === null || $phone === '') {
            throw ValidationException::withMessages(['contact_phone' => 'A contact phone number is required.']);
        }

        $order = Order::query()->create([
            'order_number' => $this->numbers->generate(),
            'user_id' => $user->id,
            'status' => OrderStatus::Pending,
            'payment_method' => $data->paymentMethod,
            'payment_status' => PaymentStatus::Pending,
            'fulfilment_type' => $data->fulfilment,
            'currency' => config('restaurant.currency'),
            'subtotal' => $subtotal,
            'discount_total' => $discount,
            'delivery_fee' => $deliveryFee,
            'total' => $total,
            'coupon_id' => $coupon?->id,
            'coupon_code' => $coupon?->code,
            'customer_name' => $user->name,
            'customer_email' => $user->email,
            'customer_phone' => $phone,
            'customer_notes' => $data->notes,
            'idempotency_key' => $data->idempotencyKey,
            'estimated_ready_at' => now()->addMinutes($this->settings->preparationMinutes()),
            ...$delivery,
        ]);

        foreach ($quoteLines as $line) {
            $orderItem = $order->items()->create([
                'product_id' => $line->product->id,
                'product_name' => $line->product->name,
                'product_slug' => $line->product->slug,
                'unit_price' => $line->unitPrice,
                'addons_unit_price' => $line->addonsUnitPrice,
                'quantity' => $line->quantity,
                'line_total' => $line->lineTotal,
            ]);
            if ($line->addons !== []) {
                $orderItem->addons()->createMany(array_map(fn (array $a) => [
                    'addon_id' => $a['addon']->id,
                    'addon_name' => $a['addon']->name,
                    'unit_price' => $a['unit_price'],
                    'quantity' => $a['quantity'],
                ], $line->addons));
            }
        }

        $this->inventory->deductForOrder($order, $lines, $user);

        if ($coupon !== null) {
            $this->coupons->recordUsage($coupon, $order, $user, $discount);
        }

        Payment::query()->create([
            'order_id' => $order->id,
            'method' => $data->paymentMethod,
            'status' => PaymentStatus::Pending,
            'amount' => $total,
            'currency' => $order->currency,
            'reference' => "{$order->order_number}-1",
        ]);

        $order->statusHistory()->create([
            'from_status' => null,
            'to_status' => OrderStatus::Pending,
            'actor_type' => OrderActor::Customer,
            'changed_by_id' => $user->id,
            'note' => 'Order placed',
        ]);

        if ($data->saveAddress && $data->address !== null && $data->fulfilment === FulfilmentType::Delivery) {
            $user->addresses()->create($data->address + ['is_default' => ! $user->addresses()->exists()]);
        }

        $cart->items()->delete();
        $cart->update(['coupon_id' => null]);

        return [$order, true];
    }

    private function assertOrderingOpen(PlaceOrderData $data): void
    {
        if (! $this->settings->acceptingOrders()) {
            throw OrderException::notAcceptingOrders();
        }
        if (! $this->settings->fulfilmentEnabled($data->fulfilment)) {
            throw OrderException::fulfilmentUnavailable($data->fulfilment);
        }
        if (! $this->settings->paymentMethodEnabled($data->paymentMethod)) {
            throw OrderException::paymentMethodUnavailable($data->paymentMethod);
        }
        if ($data->paymentMethod === PaymentMethod::PayHere && ! $this->payHere->isConfigured()) {
            throw PaymentException::gatewayNotConfigured();
        }
    }

    /** @return array<string, string|null> */
    private function deliverySnapshot(User $user, PlaceOrderData $data): array
    {
        if ($data->fulfilment === FulfilmentType::Pickup) {
            return [];
        }

        $source = $data->address;
        if ($data->addressId !== null) {
            $address = Address::query()->where('user_id', $user->id)->find($data->addressId);
            if ($address === null) {
                throw ValidationException::withMessages(['address_id' => 'The selected address is invalid.']);
            }
            $source = $address->only(['recipient_name', 'phone', 'line1', 'line2', 'city', 'postal_code', 'delivery_instructions']);
        }

        if ($source === null) {
            throw ValidationException::withMessages(['address' => 'A delivery address is required.']);
        }

        return [
            'delivery_recipient_name' => $source['recipient_name'],
            'delivery_phone' => $source['phone'],
            'delivery_line1' => $source['line1'],
            'delivery_line2' => $source['line2'] ?? null,
            'delivery_city' => $source['city'],
            'delivery_postal_code' => $source['postal_code'] ?? null,
            'delivery_instructions' => $source['delivery_instructions'] ?? null,
        ];
    }

    private function findByIdempotencyKey(User $user, string $key): ?Order
    {
        return Order::query()->where('user_id', $user->id)->where('idempotency_key', $key)->first();
    }
}
