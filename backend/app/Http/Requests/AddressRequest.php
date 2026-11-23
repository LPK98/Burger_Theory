<?php

namespace App\Http\Requests;

use App\Support\ValidationPatterns;
use Illuminate\Foundation\Http\FormRequest;

class AddressRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        $required = $this->isMethod('POST') ? 'required' : 'sometimes';

        return [
            'label' => ['nullable', 'string', 'max:50'],
            'recipient_name' => [$required, 'string', 'max:120'],
            'phone' => [$required, 'string', 'regex:'.ValidationPatterns::PHONE],
            'line1' => [$required, 'string', 'max:255'],
            'line2' => ['nullable', 'string', 'max:255'],
            'city' => [$required, 'string', 'max:100'],
            'postal_code' => ['nullable', 'string', 'max:20'],
            'delivery_instructions' => ['nullable', 'string', 'max:500'],
            'is_default' => ['sometimes', 'boolean'],
        ];
    }
}
