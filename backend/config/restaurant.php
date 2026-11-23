<?php

/*
| Restaurant-level configuration. Values an administrator changes at runtime
| (delivery fee, minimum order, opening switch…) live in the restaurant_settings
| table; the "defaults" below are used until an administrator overrides them.
|
| Money is always expressed in minor units (cents) of the restaurant currency.
*/

return [
    'name' => env('RESTAURANT_NAME', 'Burger Theory'),

    'currency' => 'LKR',

    'country' => env('RESTAURANT_COUNTRY', 'Sri Lanka'),

    // Used for "today", daily/monthly sales buckets and order numbers.
    'timezone' => env('RESTAURANT_TIMEZONE', 'Asia/Colombo'),

    'frontend_url' => rtrim((string) env('FRONTEND_URL', 'http://localhost:5173'), '/'),

    // Fallback address sent to PayHere for pickup orders (PayHere requires an address and city).
    'address' => [
        'line1' => env('RESTAURANT_ADDRESS_LINE1', 'Burger Theory'),
        'city' => env('RESTAURANT_CITY', 'Colombo'),
    ],

    // Optional extra inbox for new-order alerts, on top of every admin account.
    'order_alert_email' => env('ORDER_ALERT_EMAIL'),

    'cart' => [
        // Matches the frontend's MAX_QUANTITY.
        'max_quantity_per_item' => 20,
        'guest_ttl_days' => 30,
    ],

    'orders' => [
        // Online-payment orders left unpaid this long are cancelled and their stock released.
        'unpaid_expiry_minutes' => (int) (env('ORDER_UNPAID_EXPIRY_MINUTES') ?: 60),
    ],

    'defaults' => [
        'accepting_orders' => true,
        'delivery_enabled' => true,
        'pickup_enabled' => true,
        'cod_enabled' => true,
        'payhere_enabled' => true,
        'delivery_fee' => 35000,            // LKR 350.00
        'free_delivery_threshold' => 500000, // LKR 5,000.00 after discounts; null disables free delivery
        'minimum_order_amount' => 100000,    // LKR 1,000.00 subtotal
        'estimated_preparation_minutes' => 25,

        // Restaurant profile, editable in the admin portal (Settings).
        'restaurant_name' => env('RESTAURANT_NAME', 'Burger Theory'),
        'contact_phone' => null,
        'contact_email' => null,
        'address_line1' => env('RESTAURANT_ADDRESS_LINE1'),
        'address_line2' => null,
        'city' => env('RESTAURANT_CITY', 'Colombo'),
        'postal_code' => null,
        'instagram_url' => null,
        'facebook_url' => null,
        // Google Maps link opened by the website's Find us card, and the embedded map shown in it
        // (both editable in the admin portal). The restaurant is at 7°05'38.1"N 80°19'04.8"E.
        'maps_url' => env('RESTAURANT_MAPS_URL', 'https://www.google.com/maps/search/?api=1&query=7.093917%2C80.318000'),
        'maps_embed_url' => env('RESTAURANT_MAPS_EMBED_URL', 'https://www.google.com/maps/embed?pb=!1m17!1m12!1m3!1d3959.276522186571!2d80.31542397475873!3d7.093912092909208!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m2!1m1!2zN8KwMDUnMzguMSJOIDgwwrAxOScwNC44IkU!5e0!3m2!1sen!2slk!4v1795434666594!5m2!1sen!2slk'),
        // Opening hours: the week and special dates live in their own tables (admin portal → Opening hours).
        'temporarily_closed' => false,
        'hours_announcement' => null,
        'logo_url' => null,
        'logo_public_id' => null,
    ],
];
