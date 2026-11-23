<?php

namespace App\Http\Requests\Admin;

use App\Enums\InventoryReason;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class AdjustStockRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            /** Units to add (positive) or remove (negative). Send this or `set_to`. */
            'change' => ['required_without:set_to', 'prohibits:set_to', 'integer', 'not_in:0', 'between:-100000,100000'],
            /** Set the stock to an absolute count (e.g. after a stock take). */
            'set_to' => ['required_without:change', 'integer', 'min:0', 'max:100000'],
            'reason' => ['required', Rule::in([InventoryReason::Restock->value, InventoryReason::Adjustment->value])],
            'note' => ['nullable', 'string', 'max:500'],
        ];
    }
}
