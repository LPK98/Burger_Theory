<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\Cart\AddCartItemRequest;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Replaces the add-ons a product offers. An empty list removes them all. */
class ProductAddonsRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'addons' => ['present', 'array', 'max:50'],
            'addons.*.addon_id' => ['required', 'integer', 'distinct', Rule::exists('addons', 'id')->whereNull('deleted_at')],
            /** How many of this add-on one burger may take (default 1). */
            'addons.*.max_quantity' => ['sometimes', 'integer', 'min:1', 'max:'.AddCartItemRequest::MAX_ADDON_QUANTITY],
            /** Display order on this product (default: the order sent). */
            'addons.*.sort_order' => ['sometimes', 'integer', 'min:0', 'max:100000'],
        ];
    }

    /** @return array<int, array{max_quantity: int, sort_order: int}> add-on id => pivot */
    public function pivot(): array
    {
        $pivot = [];
        foreach (array_values($this->validated('addons')) as $position => $row) {
            $pivot[(int) $row['addon_id']] = [
                'max_quantity' => (int) ($row['max_quantity'] ?? 1),
                'sort_order' => (int) ($row['sort_order'] ?? $position),
            ];
        }

        return $pivot;
    }
}
