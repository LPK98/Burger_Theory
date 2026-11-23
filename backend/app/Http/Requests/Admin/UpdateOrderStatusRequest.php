<?php

namespace App\Http\Requests\Admin;

use App\Enums\OrderStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateOrderStatusRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'status' => ['required', Rule::enum(OrderStatus::class)->except([OrderStatus::Pending])],
            /** Required when rejecting or cancelling; shown to the customer. */
            'note' => [
                Rule::requiredIf(in_array($this->input('status'), OrderStatus::voidValues(), true)),
                'nullable', 'string', 'max:500',
            ],
        ];
    }
}
