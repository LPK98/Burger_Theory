<?php

namespace App\Http\Requests\Admin;

use App\Support\ValidationPatterns;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Money settings are integer cents. Send any subset. The logo has its own upload endpoint, and
 * opening hours have their own endpoints (/admin/opening-hours).
 */
class UpdateSettingsRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'accepting_orders' => ['sometimes', 'boolean'],
            'delivery_enabled' => ['sometimes', 'boolean'],
            'pickup_enabled' => ['sometimes', 'boolean'],
            'cod_enabled' => ['sometimes', 'boolean'],
            'payhere_enabled' => ['sometimes', 'boolean'],
            'stripe_enabled' => ['sometimes', 'boolean'],
            'delivery_fee' => ['sometimes', 'integer', 'min:0', 'max:10000000'],
            /** null disables free delivery. */
            'free_delivery_threshold' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:1000000000'],
            'minimum_order_amount' => ['sometimes', 'integer', 'min:0', 'max:1000000000'],
            'estimated_preparation_minutes' => ['sometimes', 'integer', 'min:1', 'max:600'],

            'restaurant_name' => ['sometimes', 'string', 'min:2', 'max:80'],
            'contact_phone' => ['sometimes', 'nullable', 'string', 'regex:'.ValidationPatterns::PHONE],
            'contact_email' => ['sometimes', 'nullable', 'email:rfc', 'max:255'],
            'address_line1' => ['sometimes', 'nullable', 'string', 'max:255'],
            'address_line2' => ['sometimes', 'nullable', 'string', 'max:255'],
            'city' => ['sometimes', 'nullable', 'string', 'max:100'],
            'postal_code' => ['sometimes', 'nullable', 'string', 'max:20'],
            /** https link to the Instagram profile; null hides the icon on the website. */
            'instagram_url' => ['sometimes', 'nullable', 'string', 'max:255', 'url:https', 'regex:#^https://([a-z0-9-]+\.)*instagram\.com(/|$)#i'],
            /** https link to the Facebook page; null hides the icon on the website. */
            'facebook_url' => ['sometimes', 'nullable', 'string', 'max:255', 'url:https', 'regex:#^https://([a-z0-9-]+\.)*(facebook|fb)\.com(/|$)#i'],
        ];
    }

    public function messages(): array
    {
        return [
            'instagram_url.regex' => 'Use a link to an instagram.com page.',
            'facebook_url.regex' => 'Use a link to a facebook.com page.',
        ];
    }
}
