<?php

use App\Models\Cart;
use App\Services\Order\OrderWorkflowService;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

/*
| Scheduled jobs. In production run `php artisan schedule:work` (or a cron entry for
| `php artisan schedule:run` every minute) and `php artisan queue:work` for notifications.
*/

Artisan::command('orders:expire-unpaid {--minutes= : Override ORDER_UNPAID_EXPIRY_MINUTES}', function (OrderWorkflowService $workflow) {
    $option = $this->option('minutes');
    $minutes = $option !== null && $option !== '' ? max(0, (int) $option) : (int) config('restaurant.orders.unpaid_expiry_minutes');
    $count = $workflow->expireUnpaidOnlineOrders($minutes);
    $this->info("Cancelled {$count} unpaid online order(s) older than {$minutes} minutes.");
})->purpose('Cancel online-payment (PayHere / Stripe) orders whose payment never completed and release their stock');

Artisan::command('carts:prune-guests', function () {
    $days = (int) config('restaurant.cart.guest_ttl_days');
    $count = Cart::query()->whereNull('user_id')->where('updated_at', '<', now()->subDays($days))->delete();
    $this->info("Deleted {$count} guest cart(s) idle for more than {$days} days.");
})->purpose('Delete abandoned guest carts');

Schedule::command('orders:expire-unpaid')->everyFiveMinutes()->withoutOverlapping();
Schedule::command('carts:prune-guests')->daily();
Schedule::command('sanctum:prune-expired --hours=24')->daily();
