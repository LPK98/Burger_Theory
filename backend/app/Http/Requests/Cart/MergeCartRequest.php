<?php

namespace App\Http\Requests\Cart;

use Illuminate\Foundation\Http\FormRequest;

class MergeCartRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            /** The guest cart token (the value you were sending as X-Cart-Token). */
            'cart_token' => ['required', 'uuid'],
        ];
    }
}
