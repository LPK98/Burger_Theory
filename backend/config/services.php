<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    /*
    | PayHere (Sri Lanka). The merchant secret never leaves the server: it is only used
    | to sign checkout requests and to verify server-to-server notifications.
    */
    'payhere' => [
        'merchant_id' => env('PAYHERE_MERCHANT_ID'),
        'merchant_secret' => env('PAYHERE_MERCHANT_SECRET'),
        'sandbox' => (bool) env('PAYHERE_SANDBOX', true),
        'currency' => env('PAYHERE_CURRENCY') ?: 'LKR',
        // Where PayHere sends the shopper's browser afterwards (frontend pages).
        // `?:` so a blank PAYHERE_RETURN_URL= line in .env still uses the default.
        'return_url' => env('PAYHERE_RETURN_URL') ?: rtrim((string) env('FRONTEND_URL', 'http://localhost:5173'), '/').'/checkout/complete',
        'cancel_url' => env('PAYHERE_CANCEL_URL') ?: rtrim((string) env('FRONTEND_URL', 'http://localhost:5173'), '/').'/checkout/cancelled',
        // Server-to-server callback. Must be publicly reachable (use a tunnel in development).
        // Leave empty to use this app's own route: APP_URL/api/v1/payments/payhere/notify.
        'notify_url' => env('PAYHERE_NOTIFY_URL'),
        'live_checkout_url' => 'https://www.payhere.lk/pay/checkout',
        'sandbox_checkout_url' => 'https://sandbox.payhere.lk/pay/checkout',
    ],

    'cloudinary' => [
        'cloud_name' => env('CLOUDINARY_CLOUD_NAME'),
        'api_key' => env('CLOUDINARY_API_KEY'),
        'api_secret' => env('CLOUDINARY_API_SECRET'),
        'folder' => env('CLOUDINARY_FOLDER') ?: 'burger-theory/products',
        'branding_folder' => env('CLOUDINARY_BRANDING_FOLDER') ?: 'burger-theory/branding',
    ],

];
