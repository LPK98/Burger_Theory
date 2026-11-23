<?php

namespace App\Http\Requests\Payment;

use Illuminate\Foundation\Http\FormRequest;

class StartPayHereCheckoutRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            /** The order to pay, e.g. "BT-261122-7KQ2XM". */
            'order_number' => ['required', 'string', 'max:30'],
        ];
    }
}
