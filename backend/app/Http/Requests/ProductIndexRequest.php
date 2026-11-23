<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ProductIndexRequest extends FormRequest
{
    public const SORTS = ['menu', 'price', '-price', 'name', '-name', 'newest', 'rating'];

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            /** Search name and description. */
            'search' => ['nullable', 'string', 'max:100'],
            /** Category slug, e.g. "beef". */
            'category' => ['nullable', 'string', 'max:80'],
            'featured' => ['nullable', 'boolean'],
            /** Only products with a compare_at_price (on offer). */
            'on_sale' => ['nullable', 'boolean'],
            /** Only products that can be ordered now (in stock). */
            'in_stock' => ['nullable', 'boolean'],
            /** Minimum price in cents. */
            'min_price' => ['nullable', 'integer', 'min:0'],
            /** Maximum price in cents. */
            'max_price' => ['nullable', 'integer', 'min:0', ...($this->filled('min_price') ? ['gte:min_price'] : [])],
            'sort' => ['nullable', 'in:'.implode(',', self::SORTS)],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:50'],
            'page' => ['nullable', 'integer', 'min:1'],
        ];
    }
}
