<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

/** Upload (POST, multipart) or update (PATCH) a product image. */
class ProductImageRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        if ($this->isMethod('POST')) {
            return [
                'image' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120', 'dimensions:min_width=200,min_height=200,max_width=6000,max_height=6000'],
                'alt_text' => ['nullable', 'string', 'max:255'],
                'is_primary' => ['sometimes', 'boolean'],
            ];
        }

        return [
            'alt_text' => ['sometimes', 'nullable', 'string', 'max:255'],
            'is_primary' => ['sometimes', 'accepted'],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:1000'],
        ];
    }
}
