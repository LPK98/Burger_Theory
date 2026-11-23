<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Payment\PayHere\PayHereConfig;
use App\Services\Payment\Stripe\StripeConfig;
use App\Services\Settings\RestaurantSettings;
use Illuminate\Http\JsonResponse;

/**
 * @tags Menu
 */
class RestaurantController extends Controller
{
    /**
     * Public ordering settings.
     *
     * Delivery fee, minimum order, which fulfilment and payment options are open. Money is integer cents.
     *
     * @unauthenticated
     */
    public function show(RestaurantSettings $settings, PayHereConfig $payHere, StripeConfig $stripe): JsonResponse
    {
        $s = $settings->all();

        return response()->json(['data' => [
            'name' => $s['restaurant_name'],
            /** Contact details, address, opening hours and logo, as set in the admin portal. */
            'profile' => $settings->profile(),
            'currency' => config('restaurant.currency'),
            'timezone' => config('restaurant.timezone'),
            'accepting_orders' => $s['accepting_orders'],
            'fulfilment_types' => array_values(array_filter([
                $s['delivery_enabled'] ? 'delivery' : null,
                $s['pickup_enabled'] ? 'pickup' : null,
            ])),
            'payment_methods' => array_values(array_filter([
                $s['stripe_enabled'] && $stripe->isConfigured() ? 'stripe' : null,
                $s['payhere_enabled'] && $payHere->isConfigured() ? 'payhere' : null,
                $s['cod_enabled'] ? 'cod' : null,
            ])),
            'delivery_fee' => $s['delivery_fee'],
            'free_delivery_threshold' => $s['free_delivery_threshold'],
            'minimum_order_amount' => $s['minimum_order_amount'],
            'estimated_preparation_minutes' => $s['estimated_preparation_minutes'],
            'max_quantity_per_item' => (int) config('restaurant.cart.max_quantity_per_item'),
        ]]);
    }
}
