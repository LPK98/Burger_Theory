<?php

namespace Tests\Feature\Orders;

use App\Models\Order;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class ExpireUnpaidOrdersTest extends TestCase
{
    use RefreshDatabase;

    public function test_stale_unpaid_online_orders_are_cancelled_and_stock_released(): void
    {
        Notification::fake();
        $product = Product::factory()->price(145000)->stock(10)->create();

        $stale = $this->placeOrder($this->customer(), [[$product, 2]], 'payhere')->json('data.order_number');
        $fresh = $this->placeOrder($this->customer(), [[$product, 1]], 'payhere')->json('data.order_number');
        $cod = $this->placeOrder($this->customer(), [[$product, 1]], 'cod')->json('data.order_number');
        $paid = $this->placeOrder($this->customer(), [[$product, 1]], 'payhere')->json('data.order_number');
        $this->assertSame(5, $product->fresh()->stock_quantity);

        Order::query()->whereIn('order_number', [$stale, $cod, $paid])->update(['created_at' => now()->subHours(2)]);
        Order::query()->where('order_number', $paid)->update(['payment_status' => 'paid']);

        $this->artisan('orders:expire-unpaid')->expectsOutputToContain('Cancelled 1 unpaid')->assertSuccessful();

        $status = fn ($n) => Order::query()->where('order_number', $n)->firstOrFail()->status->value;
        $this->assertSame('cancelled', $status($stale));
        $this->assertSame('pending', $status($fresh));
        $this->assertSame('pending', $status($cod));
        $this->assertSame('pending', $status($paid));
        $this->assertSame(7, $product->fresh()->stock_quantity);
        $this->assertDatabaseHas('order_status_histories', ['to_status' => 'cancelled', 'actor_type' => 'system']);
    }
}
