<?php

namespace App\Http\Requests\Order;

use App\Enums\FulfilmentType;
use App\Enums\PaymentMethod;
use App\Services\Order\PlaceOrderData;
use App\Support\ValidationPatterns;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Checkout. The items, prices and totals come from the customer's server-side cart;
 * any price or total sent here is ignored.
 *
 * Delivery needs either `address_id` (a saved address) or an inline `address`, not both.
 */
class PlaceOrderRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'fulfilment_type' => ['required', Rule::enum(FulfilmentType::class)],
            'payment_method' => ['required', Rule::enum(PaymentMethod::class)],
            /** One of your saved addresses. */
            'address_id' => [
                'nullable', 'integer',
                Rule::exists('addresses', 'id')->where('user_id', $this->user()->id)->whereNull('deleted_at'),
            ],
            'address' => ['nullable', 'array:recipient_name,phone,line1,line2,city,postal_code,delivery_instructions', 'prohibits:address_id'],
            'address.recipient_name' => ['required_with:address', 'string', 'max:120'],
            'address.phone' => ['required_with:address', 'string', 'regex:'.ValidationPatterns::PHONE],
            'address.line1' => ['required_with:address', 'string', 'max:255'],
            'address.line2' => ['nullable', 'string', 'max:255'],
            'address.city' => ['required_with:address', 'string', 'max:100'],
            'address.postal_code' => ['nullable', 'string', 'max:20'],
            'address.delivery_instructions' => ['nullable', 'string', 'max:500'],
            /** Save the inline address to your address book. */
            'save_address' => ['sometimes', 'boolean'],
            /** Defaults to the address phone, then your profile phone. */
            'contact_phone' => ['nullable', 'string', 'regex:'.ValidationPatterns::PHONE],
            'notes' => ['nullable', 'string', 'max:500'],
        ];
    }

    /** @return list<callable> */
    public function after(): array
    {
        return [
            function (Validator $validator) {
                $isDelivery = $this->input('fulfilment_type') === FulfilmentType::Delivery->value;
                if ($isDelivery && ! $this->filled('address_id') && ! is_array($this->input('address'))) {
                    $validator->errors()->add('address', 'A delivery address is required.');
                }
            },
        ];
    }

    public function toData(): PlaceOrderData
    {
        $fulfilment = FulfilmentType::from($this->validated('fulfilment_type'));
        $isDelivery = $fulfilment === FulfilmentType::Delivery;
        $key = $this->header('Idempotency-Key');

        return new PlaceOrderData(
            fulfilment: $fulfilment,
            paymentMethod: PaymentMethod::from($this->validated('payment_method')),
            addressId: $isDelivery && $this->filled('address_id') ? (int) $this->validated('address_id') : null,
            address: $isDelivery && ! $this->filled('address_id') ? $this->validated('address') : null,
            saveAddress: (bool) $this->validated('save_address', false),
            contactPhone: $this->validated('contact_phone'),
            notes: $this->validated('notes'),
            idempotencyKey: is_string($key) && $key !== '' ? mb_substr($key, 0, 100) : null,
        );
    }
}
