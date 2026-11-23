<?php

namespace App\Http\Requests\Admin;

use App\Support\ValidationPatterns;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Create (POST) or update (PUT/PATCH) a product. Prices are integer cents. */
class ProductRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        $creating = $this->isMethod('POST');
        $required = $creating ? 'required' : 'sometimes';
        $product = $this->route('product');

        return [
            'name' => [$required, 'string', 'max:120'],
            /** Generated from the name when omitted. */
            'slug' => [
                'sometimes', 'string', 'max:120', 'regex:'.ValidationPatterns::SLUG,
                Rule::unique('products', 'slug')->withoutTrashed()->ignore($product?->id),
            ],
            'description' => ['nullable', 'string', 'max:2000'],
            /** Price in cents, e.g. 145000 = LKR 1,450.00. */
            'price' => [$required, 'integer', 'min:0', 'max:9999999999'],
            /** Original price in cents when on offer; must be higher than price. */
            'compare_at_price' => ['nullable', 'integer', 'max:9999999999', $this->comparePriceRule()],
            'badge' => ['nullable', 'string', 'max:40'],
            'is_available' => ['sometimes', 'boolean'],
            'is_featured' => ['sometimes', 'boolean'],
            'track_stock' => ['sometimes', 'boolean'],
            /** Opening stock (create only). Later changes go through POST /admin/products/{id}/stock. */
            'stock_quantity' => [$creating ? 'sometimes' : 'prohibited', 'integer', 'min:0', 'max:100000'],
            'low_stock_threshold' => ['sometimes', 'integer', 'min:0', 'max:100000'],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:100000'],
            'category_ids' => [$creating ? 'required' : 'sometimes', 'array', 'min:1'],
            'category_ids.*' => ['integer', 'distinct', Rule::exists('categories', 'id')->whereNull('deleted_at')],
        ];
    }

    public function messages(): array
    {
        return [
            'stock_quantity.prohibited' => 'Change stock with POST /api/v1/admin/products/{product}/stock so the change is logged.',
        ];
    }

    private function comparePriceRule(): \Closure
    {
        return function (string $attribute, mixed $value, \Closure $fail) {
            if ($value === null) {
                return;
            }
            $price = $this->input('price', $this->route('product')?->price);
            if (is_numeric($price) && (int) $value <= (int) $price) {
                $fail('The compare-at price must be higher than the price.');
            }
        };
    }
}
