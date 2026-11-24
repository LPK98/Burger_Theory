<?php

use App\Http\Controllers\Api\V1\AddonController;
use App\Http\Controllers\Api\V1\AddressController;
use App\Http\Controllers\Api\V1\Admin;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\CartController;
use App\Http\Controllers\Api\V1\CategoryController;
use App\Http\Controllers\Api\V1\NotificationController;
use App\Http\Controllers\Api\V1\OfferController;
use App\Http\Controllers\Api\V1\OpeningHoursController;
use App\Http\Controllers\Api\V1\OrderController;
use App\Http\Controllers\Api\V1\PaymentController;
use App\Http\Controllers\Api\V1\ProductController;
use App\Http\Controllers\Api\V1\ProfileController;
use App\Http\Controllers\Api\V1\RestaurantController;
use App\Http\Controllers\Api\V1\ReviewController;
use Illuminate\Support\Facades\Route;

/*
| Burger Theory REST API, version 1. Everything here is served under /api/v1.
| Authentication: `Authorization: Bearer <token>` (Laravel Sanctum personal access tokens).
*/

Route::prefix('v1')->name('api.v1.')->group(function () {

    // Authentication ----------------------------------------------------------
    Route::middleware('throttle:auth')->group(function () {
        Route::post('register', [AuthController::class, 'register'])->name('register');
        Route::post('login', [AuthController::class, 'login'])->name('login');
        // Admin portal sign-in: tokens are issued to administrators only. There is no admin registration.
        Route::post('admin/login', [Admin\AdminAuthController::class, 'login'])->name('admin.login');
    });

    // Menu (public) -----------------------------------------------------------
    Route::get('restaurant', [RestaurantController::class, 'show'])->name('restaurant');
    Route::get('opening-hours', [OpeningHoursController::class, 'show'])->name('opening-hours');
    Route::get('categories', [CategoryController::class, 'index'])->name('categories.index');
    Route::get('categories/{category}', [CategoryController::class, 'show'])->name('categories.show');
    Route::get('products', [ProductController::class, 'index'])->name('products.index');
    Route::get('products/{product}', [ProductController::class, 'show'])->name('products.show');
    Route::get('products/{product}/reviews', [ReviewController::class, 'index'])->name('products.reviews.index');
    Route::get('offers', [OfferController::class, 'index'])->name('offers.index');
    Route::get('addons', [AddonController::class, 'index'])->name('addons.index');

    // Cart (guests via X-Cart-Token, customers via Bearer token) ----------------
    Route::middleware('auth.optional')->prefix('cart')->name('cart.')->group(function () {
        Route::get('/', [CartController::class, 'show'])->name('show');
        Route::delete('/', [CartController::class, 'clear'])->name('clear');
        Route::post('items', [CartController::class, 'addItem'])->name('items.store');
        Route::patch('items/{item}', [CartController::class, 'updateItem'])->name('items.update');
        Route::put('items/{item}', [CartController::class, 'updateItem']);
        Route::delete('items/{item}', [CartController::class, 'removeItem'])->name('items.destroy');
        Route::post('coupon', [CartController::class, 'applyCoupon'])->name('coupon.store');
        Route::delete('coupon', [CartController::class, 'removeCoupon'])->name('coupon.destroy');
    });

    // PayHere server-to-server callback (verified by signature, not by login) ---
    Route::post('payments/payhere/notify', [PaymentController::class, 'payHereNotify'])
        ->middleware('throttle:payhere-notify')
        ->name('payments.payhere.notify');

    // Stripe webhook (verified by the Stripe-Signature header, not by login) ----
    Route::post('payments/stripe/webhook', [PaymentController::class, 'stripeWebhook'])
        ->middleware('throttle:stripe-webhook')
        ->name('payments.stripe.webhook');

    // Signed-in customers -------------------------------------------------------
    Route::middleware('auth:sanctum')->group(function () {
        Route::post('logout', [AuthController::class, 'logout'])->name('logout');

        Route::get('user', [ProfileController::class, 'show'])->name('user.show');
        Route::match(['put', 'patch'], 'user', [ProfileController::class, 'update'])->name('user.update');
        Route::put('user/password', [ProfileController::class, 'updatePassword'])->name('user.password');

        Route::post('cart/merge', [CartController::class, 'merge'])->name('cart.merge');

        Route::apiResource('addresses', AddressController::class);

        Route::get('orders', [OrderController::class, 'index'])->name('orders.index');
        Route::post('orders', [OrderController::class, 'store'])->middleware('throttle:orders')->name('orders.store');
        Route::get('orders/{order}', [OrderController::class, 'show'])->name('orders.show');
        Route::post('orders/{order}/cancel', [OrderController::class, 'cancel'])->name('orders.cancel');

        Route::post('payments/payhere', [PaymentController::class, 'startPayHere'])->middleware('throttle:orders')->name('payments.payhere.start');
        Route::post('payments/stripe', [PaymentController::class, 'startStripe'])->middleware('throttle:orders')->name('payments.stripe.start');
        Route::post('payments/stripe/confirm', [PaymentController::class, 'confirmStripe'])->middleware('throttle:orders')->name('payments.stripe.confirm');
        Route::get('payments/{payment}', [PaymentController::class, 'show'])->name('payments.show');

        Route::post('products/{product}/reviews', [ReviewController::class, 'store'])->name('products.reviews.store');
        Route::patch('reviews/{review}', [ReviewController::class, 'update'])->name('reviews.update');
        Route::delete('reviews/{review}', [ReviewController::class, 'destroy'])->name('reviews.destroy');

        Route::get('notifications', [NotificationController::class, 'index'])->name('notifications.index');
        Route::post('notifications/read-all', [NotificationController::class, 'markAllRead'])->name('notifications.read-all');
        Route::post('notifications/{notification}/read', [NotificationController::class, 'markRead'])->name('notifications.read');

        // Administrators (every successful write is added to the activity log) ----
        Route::middleware(['admin', 'admin.activity'])->prefix('admin')->name('admin.')->group(function () {
            Route::get('dashboard', [Admin\DashboardController::class, 'summary'])->name('dashboard');
            Route::get('dashboard/sales', [Admin\DashboardController::class, 'sales'])->name('dashboard.sales');
            Route::get('dashboard/best-sellers', [Admin\DashboardController::class, 'bestSellers'])->name('dashboard.best-sellers');

            Route::get('products', [Admin\ProductController::class, 'index'])->name('products.index');
            Route::post('products', [Admin\ProductController::class, 'store'])->name('products.store');
            Route::get('products/{product}', [Admin\ProductController::class, 'show'])->withTrashed()->name('products.show');
            Route::match(['put', 'patch'], 'products/{product}', [Admin\ProductController::class, 'update'])->name('products.update');
            Route::delete('products/{product}', [Admin\ProductController::class, 'destroy'])->name('products.destroy');
            Route::post('products/{product}/restore', [Admin\ProductController::class, 'restore'])->withTrashed()->name('products.restore');

            Route::post('products/{product}/images', [Admin\ProductImageController::class, 'store'])->name('products.images.store');
            Route::patch('products/{product}/images/{image}', [Admin\ProductImageController::class, 'update'])->scopeBindings()->name('products.images.update');
            Route::delete('products/{product}/images/{image}', [Admin\ProductImageController::class, 'destroy'])->scopeBindings()->name('products.images.destroy');

            Route::get('products/{product}/stock', [Admin\ProductStockController::class, 'index'])->withTrashed()->name('products.stock.index');
            Route::post('products/{product}/stock', [Admin\ProductStockController::class, 'store'])->name('products.stock.store');
            Route::put('products/{product}/recipe', [Admin\ProductRecipeController::class, 'update'])->name('products.recipe.update');
            Route::put('products/{product}/addons', [Admin\ProductAddonController::class, 'update'])->name('products.addons.update');

            Route::apiResource('categories', Admin\CategoryController::class)->except('show');

            // Add-ons and extra toppings ---------------------------------------------
            Route::apiResource('addons', Admin\AddonController::class);

            // Kitchen ingredients and their stock -----------------------------------
            Route::apiResource('ingredients', Admin\IngredientController::class);
            Route::post('ingredients/{ingredient}/adjustments', [Admin\IngredientController::class, 'adjust'])->name('ingredients.adjust');
            Route::get('ingredients/{ingredient}/movements', [Admin\IngredientController::class, 'movements'])->name('ingredients.movements');
            Route::get('inventory/movements', [Admin\InventoryController::class, 'movements'])->name('inventory.movements');
            Route::get('inventory/consumption', [Admin\InventoryController::class, 'consumption'])->name('inventory.consumption');

            Route::get('customers', [Admin\CustomerController::class, 'index'])->name('customers.index');
            Route::get('customers/{customer}', [Admin\CustomerController::class, 'show'])->whereNumber('customer')->name('customers.show');

            // All accounts: roles and suspension ------------------------------------
            Route::get('users', [Admin\UserController::class, 'index'])->name('users.index');
            Route::get('users/{user}', [Admin\UserController::class, 'show'])->whereNumber('user')->name('users.show');
            Route::patch('users/{user}', [Admin\UserController::class, 'update'])->whereNumber('user')->name('users.update');

            Route::get('activity-logs', [Admin\ActivityLogController::class, 'index'])->name('activity-logs.index');

            Route::get('payments', [Admin\PaymentController::class, 'index'])->name('payments.index');
            Route::get('payments/{payment}', [Admin\PaymentController::class, 'show'])->name('payments.show');

            Route::get('reports/sales', [Admin\DashboardController::class, 'sales'])->name('reports.sales');
            Route::get('reports/best-sellers', [Admin\DashboardController::class, 'bestSellers'])->name('reports.best-sellers');
            Route::get('reports/orders', [Admin\ReportController::class, 'orders'])->name('reports.orders');

            Route::get('orders', [Admin\OrderController::class, 'index'])->name('orders.index');
            Route::get('orders/{order}', [Admin\OrderController::class, 'show'])->name('orders.show');
            Route::match(['put', 'patch'], 'orders/{order}/status', [Admin\OrderController::class, 'updateStatus'])->name('orders.status');
            Route::post('orders/{order}/cod-collection', [Admin\OrderController::class, 'collectCash'])->name('orders.cod-collection');

            Route::apiResource('coupons', Admin\CouponController::class);

            Route::get('reviews', [Admin\ReviewController::class, 'index'])->name('reviews.index');
            Route::patch('reviews/{review}', [Admin\ReviewController::class, 'update'])->name('reviews.update');
            Route::delete('reviews/{review}', [Admin\ReviewController::class, 'destroy'])->name('reviews.destroy');

            Route::get('settings', [Admin\SettingsController::class, 'show'])->name('settings.show');
            Route::match(['put', 'patch'], 'settings', [Admin\SettingsController::class, 'update'])->name('settings.update');
            // Opening hours: the week, temporary closure, announcement and special dates ---
            Route::get('opening-hours', [Admin\OpeningHoursController::class, 'show'])->name('opening-hours.show');
            Route::match(['put', 'patch'], 'opening-hours', [Admin\OpeningHoursController::class, 'update'])->name('opening-hours.update');
            Route::apiResource('opening-hours/special-dates', Admin\SpecialOpeningHourController::class)
                ->parameters(['special-dates' => 'specialDate'])
                ->names('opening-hours.special-dates');

            Route::post('settings/logo', [Admin\SettingsController::class, 'uploadLogo'])->name('settings.logo.store');
            Route::delete('settings/logo', [Admin\SettingsController::class, 'deleteLogo'])->name('settings.logo.destroy');
        });
    });
});
