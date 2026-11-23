<?php

namespace App\Http\Requests\Cart;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Only a product reference, a quantity and add-on choices are accepted: prices are never
 * taken from the client.
 */
class AddCartItemRequest extends FormRequest
{
    public const MAX_ADDON_QUANTITY = 10;

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $max = (int) config('restaurant.cart.max_quantity_per_item');

        return [
            /** Numeric product id. Send this or product_slug. */
            'product_id' => ['required_without:product_slug', 'nullable', 'integer', 'min:1'],
            /** Product slug, e.g. "theory-classic" (the frontend's product id). */
            'product_slug' => ['required_without:product_id', 'nullable', 'string', 'max:120'],
            'quantity' => ['sometimes', 'integer', 'min:1', "max:{$max}"],
            /**
             * Optional add-ons for each burger on this line, from the product's `addons` list.
             * The same product with different add-ons becomes a separate cart line.
             */
            'addons' => ['sometimes', 'array', 'max:20'],
            'addons.*.addon_id' => ['required', 'integer', 'min:1', 'distinct'],
            /** Per burger (default 1), up to the add-on's `max_quantity` for this product. */
            'addons.*.quantity' => ['sometimes', 'integer', 'min:1', 'max:'.self::MAX_ADDON_QUANTITY],
        ];
    }

    /**
     * add-on id => quantity per burger.
     *
     * @return array<int, int>
     */
    public function addonQuantities(): array
    {
        $quantities = [];
        foreach ($this->validated('addons', []) as $row) {
            $quantities[(int) $row['addon_id']] = (int) ($row['quantity'] ?? 1);
        }

        return $quantities;
    }
}
