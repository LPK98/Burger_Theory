<?php

namespace App\Http\Requests\Cart;

use App\Enums\FulfilmentType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ShowCartRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            /** Price the cart for delivery (default) or pickup. */
            'fulfilment_type' => ['nullable', Rule::enum(FulfilmentType::class)],
        ];
    }

    public function fulfilment(): FulfilmentType
    {
        return FulfilmentType::tryFrom((string) $this->query('fulfilment_type')) ?? FulfilmentType::Delivery;
    }
}
