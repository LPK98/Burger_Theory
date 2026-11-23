<?php

namespace App\Http\Requests\Admin;

use App\Enums\IngredientUnit;
use App\Models\Ingredient;
use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Create (POST) or update (PATCH) an ingredient. Quantities allow up to 3 decimals. */
class IngredientRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        if (is_string($this->input('name'))) {
            $this->merge(['name' => trim($this->input('name'))]);
        }
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $creating = $this->isMethod('POST');

        return [
            'name' => [$creating ? 'required' : 'sometimes', 'string', 'min:2', 'max:120', $this->uniqueName()],
            /** g, kg, ml, l or pcs. Set when the ingredient is created and fixed after that. */
            'unit' => [$creating ? 'required' : 'prohibited', Rule::enum(IngredientUnit::class)],
            /** Reported as low stock at or below this level. */
            'min_stock_level' => ['sometimes', 'numeric', 'decimal:0,3', 'min:0', 'max:99999999'],
            /** Opening stock (create only). Later changes are recorded as adjustments. */
            'stock_quantity' => [$creating ? 'sometimes' : 'prohibited', 'numeric', 'decimal:0,3', 'min:0', 'max:99999999'],
            'notes' => ['nullable', 'string', 'max:500'],
        ];
    }

    public function messages(): array
    {
        return [
            'unit.prohibited' => 'The unit can’t change after an ingredient is created, because its stock history is recorded in that unit.',
            'stock_quantity.prohibited' => 'Change stock by recording an adjustment, so the change is logged.',
        ];
    }

    private function uniqueName(): Closure
    {
        return function (string $attribute, mixed $value, Closure $fail) {
            $taken = Ingredient::query()
                ->whereRaw('lower(name) = ?', [mb_strtolower((string) $value)])
                ->when($this->route('ingredient'), fn ($q, Ingredient $current) => $q->whereKeyNot($current->id))
                ->exists();
            if ($taken) {
                $fail('An ingredient with this name already exists.');
            }
        };
    }
}
