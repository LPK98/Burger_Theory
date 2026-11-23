<?php

namespace App\Http\Requests\Admin;

use App\Services\Hours\OpeningHoursService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * The regular week, the temporary-closure switch and the announcement. Send any subset.
 * Times are "HH:MM" (24-hour) in the restaurant timezone; a closing time earlier than the
 * opening time means after midnight, and 23:59 means "until midnight".
 */
class UpdateOpeningHoursRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        if (is_string($this->input('announcement'))) {
            $this->merge(['announcement' => trim($this->input('announcement'))]);
        }
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            /** Seven entries, one per day: {day, closed, open: "HH:MM", close: "HH:MM"}. */
            'weekly' => ['sometimes', 'array', 'size:7'],
            'weekly.*.day' => ['required', 'distinct', Rule::in(OpeningHoursService::DAYS)],
            'weekly.*.closed' => ['required', 'boolean'],
            'weekly.*.open' => ['exclude_if:weekly.*.closed,true', 'required', 'date_format:H:i'],
            'weekly.*.close' => ['exclude_if:weekly.*.closed,true', 'required', 'date_format:H:i', 'different:weekly.*.open'],
            /** Closes the restaurant right now, whatever the hours say, until switched off. */
            'temporarily_closed' => ['sometimes', 'boolean'],
            /** Shown to customers in the hours panel. null or "" removes it. */
            'announcement' => ['sometimes', 'nullable', 'string', 'max:500'],
        ];
    }

    public function attributes(): array
    {
        return [
            'weekly.*.open' => 'opening time',
            'weekly.*.close' => 'closing time',
        ];
    }
}
