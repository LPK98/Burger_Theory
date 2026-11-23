<?php

namespace App\Http\Requests\Admin;

use App\Enums\AddonKind;
use App\Support\ValidationPatterns;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/** Create (POST) or update (PUT/PATCH) an add-on. Prices are integer cents. */
class AddonRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        if ($this->isMethod('POST') && ! $this->filled('slug') && is_string($this->input('name'))) {
            $this->merge(['slug' => Str::slug($this->input('name'))]);
        }
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $required = $this->isMethod('POST') ? 'required' : 'sometimes';

        return [
            'name' => [$required, 'string', 'max:80'],
            /** Generated from the name when omitted. */
            'slug' => [
                $required, 'string', 'max:80', 'regex:'.ValidationPatterns::SLUG,
                Rule::unique('addons', 'slug')->withoutTrashed()->ignore($this->route('addon')?->id),
            ],
            'description' => ['nullable', 'string', 'max:255'],
            /** topping, sauce, side or extra. */
            'kind' => ['sometimes', Rule::enum(AddonKind::class)],
            /** Price in cents per add-on, e.g. 15000 = LKR 150.00. 0 for a free choice. */
            'price' => [$required, 'integer', 'min:0', 'max:9999999999'],
            'is_available' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:100000'],
        ];
    }
}
