<?php

namespace App\Http\Requests\Cart;

use Illuminate\Foundation\Http\FormRequest;

class UpdateCartItemRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        $max = (int) config('restaurant.cart.max_quantity_per_item');

        return [
            /** New quantity. 0 removes the line; negative values are rejected. */
            'quantity' => ['required', 'integer', 'min:0', "max:{$max}"],
        ];
    }
}
