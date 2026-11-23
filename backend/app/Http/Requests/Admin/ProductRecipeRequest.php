<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Replaces a product's recipe. An empty list clears it. */
class ProductRecipeRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'items' => ['present', 'array', 'max:50'],
            'items.*.ingredient_id' => ['required', 'integer', 'distinct', Rule::exists('ingredients', 'id')->whereNull('deleted_at')],
            /** Amount of the ingredient one unit of the product uses, in the ingredient's unit. */
            'items.*.quantity' => ['required', 'numeric', 'decimal:0,3', 'gt:0', 'max:100000'],
        ];
    }
}
