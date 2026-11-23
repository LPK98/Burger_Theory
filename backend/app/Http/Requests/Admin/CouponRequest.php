<?php

namespace App\Http\Requests\Admin;

use App\Enums\DiscountType;
use App\Models\Coupon;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Money fields are integer cents; `percentage` is a whole percent (1–100). */
class CouponRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        if (is_string($this->input('code'))) {
            $this->merge(['code' => Coupon::normalizeCode($this->input('code'))]);
        }
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $creating = $this->isMethod('POST');
        $required = $creating ? 'required' : 'sometimes';
        $type = $this->input('discount_type', $this->route('coupon')?->discount_type?->value);

        return [
            'code' => [$required, 'string', 'min:3', 'max:40', 'regex:/^[A-Z0-9_-]+$/',
                Rule::unique('coupons', 'code')->withoutTrashed()->ignore($this->route('coupon')?->id)],
            'description' => ['nullable', 'string', 'max:255'],
            'discount_type' => [$required, Rule::enum(DiscountType::class)],
            'percentage' => [
                Rule::requiredIf($type === DiscountType::Percentage->value && ($creating || $this->has('discount_type'))),
                Rule::prohibitedIf($type === DiscountType::Fixed->value),
                'nullable', 'integer', 'between:1,100',
            ],
            'amount' => [
                Rule::requiredIf($type === DiscountType::Fixed->value && ($creating || $this->has('discount_type'))),
                Rule::prohibitedIf($type === DiscountType::Percentage->value),
                'nullable', 'integer', 'min:1', 'max:9999999999',
            ],
            'max_discount_amount' => ['nullable', 'integer', 'min:1', 'max:9999999999'],
            'min_order_amount' => ['nullable', 'integer', 'min:0', 'max:9999999999'],
            'usage_limit' => ['nullable', 'integer', 'min:1'],
            'usage_limit_per_user' => ['nullable', 'integer', 'min:1'],
            'starts_at' => ['nullable', 'date'],
            'expires_at' => ['nullable', 'date', 'after:starts_at'],
            'is_active' => ['sometimes', 'boolean'],
            'is_public' => ['sometimes', 'boolean'],
        ];
    }

    /** @return array<string, mixed> */
    public function couponData(): array
    {
        $data = $this->validated();
        // Switching type clears the other type's value so the database constraint holds.
        if (($data['discount_type'] ?? null) === DiscountType::Percentage->value) {
            $data['amount'] = null;
        } elseif (($data['discount_type'] ?? null) === DiscountType::Fixed->value) {
            $data['percentage'] = null;
        }

        // Eloquent stores a date's wall-clock time and drops its offset, so "23:59+05:30"
        // would be saved as 23:59 UTC. Convert to UTC first. A time without an offset is
        // read in the restaurant's timezone, which is what an admin typing a time means.
        foreach (['starts_at', 'expires_at'] as $key) {
            if (! empty($data[$key])) {
                $data[$key] = CarbonImmutable::parse($data[$key], (string) config('restaurant.timezone'))->utc();
            }
        }

        return $data;
    }
}
