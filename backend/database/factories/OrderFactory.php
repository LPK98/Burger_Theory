<?php

namespace Database\Factories;

use App\Enums\FulfilmentType;
use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use App\Enums\PaymentStatus;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Product;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * Builds a consistent order (one line, totals that satisfy the database checks) plus its payment.
 * Use OrderPlacementService for real checkouts; this factory is for reporting/admin tests.
 *
 * @extends Factory<Order>
 */
class OrderFactory extends Factory
{
    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'order_number' => 'BT-'.now()->format('ymd').'-'.strtoupper(Str::random(6)),
            'user_id' => User::factory(),
            'status' => OrderStatus::Pending,
            'payment_method' => PaymentMethod::CashOnDelivery,
            'payment_status' => PaymentStatus::Pending,
            'fulfilment_type' => FulfilmentType::Pickup,
            'currency' => config('restaurant.currency'),
            'subtotal' => 200000,
            'discount_total' => 0,
            'delivery_fee' => 0,
            'total' => 200000,
            'customer_name' => fake()->name(),
            'customer_email' => fake()->safeEmail(),
            'customer_phone' => '0771234567',
        ];
    }

    public function status(OrderStatus $status): static
    {
        return $this->state(fn () => ['status' => $status]);
    }

    public function paid(?\DateTimeInterface $at = null): static
    {
        return $this->state(fn () => ['payment_status' => PaymentStatus::Paid, 'paid_at' => $at ?? now()]);
    }

    public function payhere(): static
    {
        return $this->state(fn () => ['payment_method' => PaymentMethod::PayHere]);
    }

    /** Sets subtotal/total (cents) with no discount or fee. */
    public function total(int $cents): static
    {
        return $this->state(fn () => ['subtotal' => $cents, 'discount_total' => 0, 'delivery_fee' => 0, 'total' => $cents]);
    }

    /** Adds one order line for the product covering the whole subtotal. */
    public function withItem(Product $product, int $quantity = 1): static
    {
        return $this->state(fn () => [
            'subtotal' => $product->price * $quantity,
            'discount_total' => 0,
            'delivery_fee' => 0,
            'total' => $product->price * $quantity,
        ])->afterCreating(fn (Order $order) => $order->items()->create([
            'product_id' => $product->id,
            'product_name' => $product->name,
            'product_slug' => $product->slug,
            'unit_price' => $product->price,
            'quantity' => $quantity,
            'line_total' => $product->price * $quantity,
        ]));
    }

    public function configure(): static
    {
        return $this->afterCreating(function (Order $order) {
            if ($order->payments()->exists()) {
                return;
            }
            Payment::query()->create([
                'order_id' => $order->id,
                'method' => $order->payment_method,
                'status' => $order->payment_status === PaymentStatus::Paid ? PaymentStatus::Paid : PaymentStatus::Pending,
                'amount' => $order->total,
                'currency' => $order->currency,
                'reference' => $order->order_number.'-1',
                'paid_at' => $order->paid_at,
            ]);
        });
    }
}
