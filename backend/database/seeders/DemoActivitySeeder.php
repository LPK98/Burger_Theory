<?php

namespace Database\Seeders;

use App\Enums\FulfilmentType;
use App\Enums\IngredientMovementReason;
use App\Enums\OrderActor;
use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use App\Enums\PaymentStatus;
use App\Enums\UserRole;
use App\Models\Ingredient;
use App\Models\IngredientMovement;
use App\Models\Order;
use App\Models\Payment;
use App\Models\PaymentEvent;
use App\Models\Product;
use App\Models\User;
use App\Services\Inventory\IngredientService;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * OPT-IN demo history for trying the admin portal on a development database:
 *
 *   php artisan db:seed --class=DemoActivitySeeder
 *
 * Creates ~30 demo customers (@example.test, random unusable passwords) and about 90 days
 * of orders with payments, status timelines, ingredient consumption and weekly restocks.
 * Product stock is not touched. Refuses to run in production or twice on one database.
 */
class DemoActivitySeeder extends Seeder
{
    private const DAYS = 90;

    private const FIRST_NAMES = ['Nimali', 'Kasun', 'Ayesha', 'Dinuka', 'Tharindu', 'Sachini', 'Ruwan', 'Ishara', 'Malsha', 'Chamath', 'Hiruni', 'Pasindu', 'Nadeesha', 'Lahiru', 'Senuri', 'Ravindu', 'Dilani', 'Yasas', 'Kavindi', 'Shehan', 'Amaya', 'Janith', 'Oshadi', 'Sandun', 'Thilini', 'Heshan', 'Minoli', 'Akila', 'Rashmi', 'Vimukthi'];

    private const LAST_NAMES = ['Perera', 'Silva', 'Fernando', 'Jayasinghe', 'Wickramasinghe', 'Bandara', 'Gunawardena', 'Rajapaksha', 'Senanayake', 'Herath', 'Dissanayake', 'Karunaratne'];

    /** Relative popularity of each burger. */
    private const POPULARITY = ['theory-classic' => 30, 'double-trouble' => 18, 'fire-house' => 12, 'crispy-chicken' => 14, 'cheese-overload' => 9, 'ultimate-stack' => 6, 'nashville-heat' => 9, 'garden-theory' => 5, 'truffle-shroom' => 7];

    public function run(IngredientService $ingredients): void
    {
        if (app()->isProduction()) {
            $this->command?->error('Refusing to seed demo activity in production.');

            return;
        }
        if (User::query()->where('email', 'like', 'demo.%@example.test')->exists()) {
            $this->command?->warn('Demo activity is already seeded on this database.');

            return;
        }
        if (Product::query()->count() === 0) {
            $this->call([RestaurantSettingsSeeder::class, MenuSeeder::class]);
        }
        $this->call(IngredientSeeder::class);

        mt_srand(2026);
        $tz = (string) config('restaurant.timezone');
        $today = CarbonImmutable::now($tz)->startOfDay();
        $products = Product::query()->whereIn('slug', array_keys(self::POPULARITY))->get()->keyBy('slug');
        $customers = $this->customers($today);
        $sequence = 0;

        DB::transaction(function () use ($ingredients, $tz, $today, $products, $customers, &$sequence) {
            for ($d = self::DAYS - 1; $d >= 0; $d--) {
                $day = $today->subDays($d);
                if ($day->isMonday()) {
                    $this->restock($ingredients, $day->setTime(8, 30)->utc());
                }

                $growth = 0.6 + 0.4 * (1 - $d / self::DAYS);
                $weekend = in_array($day->dayOfWeekIso, [5, 6, 7], true) ? 1.45 : 1.0;
                $count = (int) round(mt_rand(7, 12) * $growth * $weekend);
                $times = [];
                for ($i = 0; $i < $count; $i++) {
                    $times[] = $day->setTime($this->hour(), mt_rand(0, 59), mt_rand(0, 59));
                }
                sort($times);

                foreach ($times as $placedAt) {
                    if ($placedAt->greaterThan(CarbonImmutable::now($tz))) {
                        continue;
                    }
                    $eligible = $customers->filter(fn (User $u) => $u->created_at->lessThanOrEqualTo($placedAt));
                    if ($eligible->isEmpty()) {
                        continue;
                    }
                    $this->order($ingredients, $eligible->random(), $products, $placedAt->utc(), ++$sequence, $d === 0);
                }
            }
        });

        $this->command?->info("Seeded {$customers->count()} demo customers and {$sequence} demo orders.");
    }

    /** @return \Illuminate\Support\Collection<int, User> */
    private function customers(CarbonImmutable $today): \Illuminate\Support\Collection
    {
        return collect(range(1, 30))->map(function (int $n) use ($today) {
            $first = self::FIRST_NAMES[$n - 1];
            $last = self::LAST_NAMES[mt_rand(0, count(self::LAST_NAMES) - 1)];
            $user = new User([
                'name' => "{$first} {$last}",
                'email' => sprintf('demo.%s.%02d@example.test', Str::lower($first), $n),
                'phone' => sprintf('07%d %03d %04d', mt_rand(0, 8), mt_rand(100, 999), mt_rand(1000, 9999)),
                'password' => Str::password(32),
            ]);
            $joined = $today->subDays(mt_rand(0, self::DAYS + 30))->setTime(mt_rand(8, 22), mt_rand(0, 59))->utc();
            $user->forceFill(['role' => UserRole::Customer, 'email_verified_at' => $joined, 'created_at' => $joined, 'updated_at' => $joined])->save();

            return $user;
        });
    }

    /** Lunch and dinner peaks. */
    private function hour(): int
    {
        $weights = [11 => 4, 12 => 10, 13 => 9, 14 => 5, 15 => 2, 16 => 2, 17 => 3, 18 => 7, 19 => 11, 20 => 10, 21 => 6, 22 => 3];

        return $this->weighted($weights);
    }

    /** @param array<int|string, int> $weights */
    private function weighted(array $weights): int|string
    {
        $roll = mt_rand(1, array_sum($weights));
        foreach ($weights as $key => $weight) {
            if (($roll -= $weight) <= 0) {
                return $key;
            }
        }

        return array_key_first($weights);
    }

    private function order(IngredientService $ingredients, User $customer, $products, CarbonImmutable $placedAt, int $sequence, bool $today): void
    {
        $lines = [];
        foreach (range(1, $this->weighted([1 => 55, 2 => 32, 3 => 13])) as $_) {
            $slug = $this->weighted(self::POPULARITY);
            $lines[$slug] = ($lines[$slug] ?? 0) + $this->weighted([1 => 80, 2 => 17, 3 => 3]);
        }
        $subtotal = collect($lines)->sum(fn ($qty, $slug) => $products[$slug]->price * $qty);

        $delivery = mt_rand(1, 100) <= 62;
        $payhere = mt_rand(1, 100) <= 55;
        $fee = $delivery && $subtotal < 500000 ? 35000 : 0;
        $status = $this->finalStatus($today, $placedAt, $delivery);
        $void = $status->isVoid();

        $paidAt = null;
        if ($payhere && ! ($void && mt_rand(1, 100) <= 50)) {
            $paidAt = $placedAt->addMinutes(mt_rand(1, 4));
        } elseif (! $payhere && $status === OrderStatus::Delivered) {
            $paidAt = $placedAt->addMinutes(mt_rand(30, 55));
        }
        $paymentStatus = match (true) {
            $void && $paidAt !== null => PaymentStatus::RefundRequired,
            $void => PaymentStatus::Cancelled,
            $paidAt !== null => PaymentStatus::Paid,
            default => PaymentStatus::Pending,
        };

        $order = new Order([
            'order_number' => 'BT-'.$placedAt->setTimezone((string) config('restaurant.timezone'))->format('ymd').'-D'.str_pad((string) $sequence, 5, '0', STR_PAD_LEFT),
            'user_id' => $customer->id,
            'status' => $status,
            'payment_method' => $payhere ? PaymentMethod::PayHere : PaymentMethod::CashOnDelivery,
            'payment_status' => $paymentStatus,
            'fulfilment_type' => $delivery ? FulfilmentType::Delivery : FulfilmentType::Pickup,
            'currency' => 'LKR',
            'subtotal' => $subtotal,
            'discount_total' => 0,
            'delivery_fee' => $fee,
            'total' => $subtotal + $fee,
            'customer_name' => $customer->name,
            'customer_email' => $customer->email,
            'customer_phone' => $customer->phone,
            'delivery_recipient_name' => $delivery ? $customer->name : null,
            'delivery_phone' => $delivery ? $customer->phone : null,
            'delivery_line1' => $delivery ? mt_rand(3, 220).' '.['Galle Road', 'Duplication Road', 'Havelock Road', 'Ward Place', 'Bauddhaloka Mawatha'][mt_rand(0, 4)] : null,
            'delivery_city' => $delivery ? ['Colombo 03', 'Colombo 04', 'Colombo 05', 'Colombo 07', 'Dehiwala'][mt_rand(0, 4)] : null,
            'estimated_ready_at' => $placedAt->addMinutes(25),
        ]);
        $order->forceFill([
            'paid_at' => $paidAt,
            'delivered_at' => $status === OrderStatus::Delivered ? $placedAt->addMinutes(mt_rand(30, 55)) : null,
            'cancelled_at' => $void ? $placedAt->addMinutes(mt_rand(3, 20)) : null,
            'cancelled_by' => $void ? ($status === OrderStatus::Rejected ? OrderActor::Admin : [OrderActor::Customer, OrderActor::Admin][mt_rand(0, 1)]) : null,
            'cancellation_reason' => $void ? ($status === OrderStatus::Rejected ? 'Kitchen at capacity' : 'Changed my mind') : null,
            'created_at' => $placedAt,
            'updated_at' => $placedAt,
        ])->save();

        $order->items()->createMany(collect($lines)->map(fn ($qty, $slug) => [
            'product_id' => $products[$slug]->id,
            'product_name' => $products[$slug]->name,
            'product_slug' => $slug,
            'unit_price' => $products[$slug]->price,
            'quantity' => $qty,
            'line_total' => $products[$slug]->price * $qty,
        ])->values()->all());

        $payment = Payment::query()->create([
            'order_id' => $order->id,
            'method' => $order->payment_method,
            'status' => $paymentStatus,
            'amount' => $order->total,
            'currency' => 'LKR',
            'reference' => "{$order->order_number}-1",
            'provider_payment_id' => $payhere && $paidAt !== null ? (string) (320000000000 + $sequence) : null,
            'provider_status_code' => $payhere && $paidAt !== null ? 2 : null,
            'provider_method' => $payhere && $paidAt !== null ? ['VISA', 'MASTER', 'AMEX'][mt_rand(0, 2)] : null,
            'card_mask' => $payhere && $paidAt !== null ? '************'.mt_rand(1000, 9999) : null,
            'paid_at' => $paidAt,
            'collected_at' => ! $payhere && $paidAt !== null ? $paidAt : null,
        ]);
        $payment->forceFill(['created_at' => $placedAt, 'updated_at' => $paidAt ?? $placedAt])->save();

        // A paid card payment always has the signed PayHere notification that marked it paid.
        if ($payhere && $paidAt !== null) {
            (new PaymentEvent([
                'payment_id' => $payment->id,
                'provider' => 'payhere',
                'reference' => $payment->reference,
                'provider_status_code' => 2,
                'signature_valid' => true,
                'outcome' => 'processed',
                'payload' => ['demo' => true, 'status_code' => '2'],
            ]))->forceFill(['created_at' => $paidAt])->save();
        }

        $this->timeline($order, $status, $placedAt);

        $ingredients->consumeForOrder($order, collect($lines)->map(fn ($qty, $slug) => ['product' => $products[$slug], 'quantity' => $qty])->values()->all(), null);
        IngredientMovement::query()->where('order_id', $order->id)->update(['created_at' => $placedAt]);
        if ($void) {
            $ingredients->releaseForOrder($order, null);
            IngredientMovement::query()->where('order_id', $order->id)->where('reason', IngredientMovementReason::OrderRelease->value)->update(['created_at' => $order->cancelled_at]);
        }
    }

    private function finalStatus(bool $today, CarbonImmutable $placedAt, bool $delivery): OrderStatus
    {
        $minutesAgo = $placedAt->diffInMinutes(CarbonImmutable::now(), absolute: true);
        if ($today && $minutesAgo < 90) {
            $steps = $delivery
                ? [OrderStatus::Pending, OrderStatus::Confirmed, OrderStatus::Preparing, OrderStatus::Ready, OrderStatus::OutForDelivery]
                : [OrderStatus::Pending, OrderStatus::Confirmed, OrderStatus::Preparing, OrderStatus::Ready];

            return $steps[min(count($steps) - 1, intdiv((int) $minutesAgo, 15))];
        }

        return match ($this->weighted(['delivered' => 90, 'cancelled' => 6, 'rejected' => 4])) {
            'cancelled' => OrderStatus::Cancelled,
            'rejected' => OrderStatus::Rejected,
            default => OrderStatus::Delivered,
        };
    }

    private function timeline(Order $order, OrderStatus $final, CarbonImmutable $placedAt): void
    {
        $path = $order->fulfilment_type === FulfilmentType::Delivery
            ? [OrderStatus::Confirmed, OrderStatus::Preparing, OrderStatus::Ready, OrderStatus::OutForDelivery, OrderStatus::Delivered]
            : [OrderStatus::Confirmed, OrderStatus::Preparing, OrderStatus::Ready, OrderStatus::Delivered];

        $rows = [['from_status' => null, 'to_status' => OrderStatus::Pending, 'actor_type' => OrderActor::Customer, 'note' => 'Order placed', 'created_at' => $placedAt]];
        if ($final->isVoid()) {
            $rows[] = ['from_status' => OrderStatus::Pending, 'to_status' => $final, 'actor_type' => $order->cancelled_by, 'note' => $order->cancellation_reason, 'created_at' => $order->cancelled_at];
        } else {
            $at = $placedAt;
            $from = OrderStatus::Pending;
            foreach ($path as $step) {
                if ($final === OrderStatus::Pending) {
                    break;
                }
                $at = $at->addMinutes(mt_rand(4, 12));
                $rows[] = ['from_status' => $from, 'to_status' => $step, 'actor_type' => OrderActor::Admin, 'note' => null, 'created_at' => $at];
                $from = $step;
                if ($step === $final) {
                    break;
                }
            }
        }
        foreach ($rows as $row) {
            $order->statusHistory()->make($row)->forceFill(['created_at' => $row['created_at']])->save();
        }
    }

    /** Monday delivery: tops each ingredient back up to 2.2 times its minimum (so a busy week runs some low). */
    private function restock(IngredientService $ingredients, CarbonImmutable $at): void
    {
        foreach (Ingredient::query()->get() as $ingredient) {
            $target = (float) $ingredient->min_stock_level * 2.2;
            $missing = round($target - (float) $ingredient->stock_quantity, 3);
            if ($missing <= 0) {
                continue;
            }
            $movement = $ingredients->adjust($ingredient, IngredientMovementReason::Restock, (string) $missing, null, 'Weekly supplier delivery', null);
            $movement->forceFill(['created_at' => $at])->save();
        }
    }
}
