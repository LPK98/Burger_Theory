<?php

namespace App\Http\Requests\Admin;

use App\Enums\IngredientMovementReason;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class AdjustIngredientRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            /** restock (adds), adjustment (stock count, either way) or waste (removes). */
            'reason' => ['required', Rule::in(array_map(fn ($r) => $r->value, IngredientMovementReason::manual()))],
            /** Amount to add (positive) or remove (negative). Send this or `set_to`. */
            'change' => ['required_without:set_to', 'prohibits:set_to', 'numeric', 'decimal:0,3', 'not_in:0', 'between:-99999999,99999999'],
            /** The counted amount after a stock take. */
            'set_to' => ['required_without:change', 'numeric', 'decimal:0,3', 'min:0', 'max:99999999'],
            'note' => ['nullable', 'string', 'max:500'],
        ];
    }

    public function reason(): IngredientMovementReason
    {
        return IngredientMovementReason::from($this->validated('reason'));
    }
}
