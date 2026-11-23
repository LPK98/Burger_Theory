<?php

namespace App\Http\Requests\Admin;

use App\Enums\FulfilmentType;
use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use App\Enums\PaymentStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class AdminOrderIndexRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            /** One status, or several comma-separated (e.g. "pending,confirmed"). */
            'status' => ['nullable', 'string', 'max:200', function ($attribute, $value, $fail) {
                foreach (explode(',', (string) $value) as $s) {
                    if (OrderStatus::tryFrom(trim($s)) === null) {
                        $fail("Unknown status [{$s}].");
                    }
                }
            }],
            'payment_status' => ['nullable', Rule::enum(PaymentStatus::class)],
            'payment_method' => ['nullable', Rule::enum(PaymentMethod::class)],
            'fulfilment_type' => ['nullable', Rule::enum(FulfilmentType::class)],
            /** One customer's orders (their user id). */
            'customer_id' => ['nullable', 'integer', 'min:1'],
            /** Placed on or after this date (restaurant timezone), YYYY-MM-DD. */
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            /** Placed on or before this date (restaurant timezone), YYYY-MM-DD. */
            'date_to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:date_from'],
            /** Order number, customer name, email or phone. */
            'search' => ['nullable', 'string', 'max:100'],
            'sort' => ['nullable', 'in:newest,oldest,total,-total'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ];
    }
}
