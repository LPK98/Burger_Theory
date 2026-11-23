<?php

namespace App\Http\Requests\Admin;

use App\Models\SpecialOpeningHour;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * A holiday, temporary closure or day with special hours. Dates are YYYY-MM-DD in the
 * restaurant timezone; `ends_on` defaults to `starts_on` (a single day). Ranges may not overlap.
 */
class SpecialOpeningHourRequest extends FormRequest
{
    /** Longest range one entry may cover, in days. */
    public const MAX_DAYS = 366;

    protected function prepareForValidation(): void
    {
        foreach (['title', 'note'] as $key) {
            if (is_string($this->input($key))) {
                $this->merge([$key => trim($this->input($key))]);
            }
        }
        if ($this->isMethod('POST') && $this->filled('starts_on') && ! $this->filled('ends_on')) {
            $this->merge(['ends_on' => $this->input('starts_on')]);
        }
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $required = $this->isMethod('POST') ? 'required' : 'sometimes';
        $closed = $this->boolean('closed', (bool) ($this->current()?->is_closed ?? true));
        // Hours are sent as a set: changing any of closed/open/close needs both times when open.
        $needsTimes = ! $closed && ($this->isMethod('POST') || $this->hasAny(['closed', 'open', 'close']));

        return [
            'starts_on' => [$required, 'date_format:Y-m-d'],
            'ends_on' => [$required, 'date_format:Y-m-d'],
            /** true: closed all day. false: open with `open`/`close`. */
            'closed' => [$required, 'boolean'],
            'open' => [$needsTimes ? 'required' : 'exclude', 'date_format:H:i'],
            'close' => [$needsTimes ? 'required' : 'exclude', 'date_format:H:i', 'different:open'],
            /** Shown to customers, e.g. "Christmas Day". */
            'title' => [$required, 'string', 'min:2', 'max:80'],
            /** Optional extra message for customers. */
            'note' => ['sometimes', 'nullable', 'string', 'max:255'],
        ];
    }

    public function attributes(): array
    {
        return [
            'starts_on' => 'start date',
            'ends_on' => 'end date',
            'open' => 'opening time',
            'close' => 'closing time',
        ];
    }

    /** Range rules need both dates, including the stored one on a partial update. */
    public function after(): array
    {
        return [function (Validator $validator) {
            if ($validator->errors()->hasAny(['starts_on', 'ends_on'])) {
                return;
            }
            $current = $this->current();
            $from = $this->input('starts_on', $current?->starts_on?->toDateString());
            $to = $this->input('ends_on', $current?->ends_on?->toDateString());
            if ($from === null || $to === null) {
                return;
            }

            if ($to < $from) {
                $validator->errors()->add('ends_on', 'The end date must be on or after the start date.');

                return;
            }
            $span = CarbonImmutable::parse($from)->diffInDays(CarbonImmutable::parse($to)) + 1;
            if ($span > self::MAX_DAYS) {
                $validator->errors()->add('ends_on', 'One entry can cover at most '.self::MAX_DAYS.' days.');

                return;
            }
            $today = CarbonImmutable::now((string) config('restaurant.timezone'))->toDateString();
            if (($this->has('starts_on') || $this->has('ends_on')) && $to < $today) {
                $validator->errors()->add('ends_on', 'The dates are already in the past.');

                return;
            }

            $clash = SpecialOpeningHour::query()
                ->covering($from, $to)
                ->when($current, fn ($q) => $q->whereKeyNot($current->id))
                ->orderBy('starts_on')
                ->first();
            if ($clash !== null) {
                $range = $clash->starts_on->equalTo($clash->ends_on)
                    ? $clash->starts_on->format('j M Y')
                    : $clash->starts_on->format('j M').' – '.$clash->ends_on->format('j M Y');
                $validator->errors()->add('starts_on', "These dates overlap “{$clash->title}” ({$range}).");
            }
        }];
    }

    /** @return array<string, mixed> Model attributes. */
    public function specialData(): array
    {
        $data = $this->validated();
        $out = array_intersect_key($data, array_flip(['starts_on', 'ends_on', 'title', 'note']));
        $closed = array_key_exists('closed', $data) ? (bool) $data['closed'] : (bool) ($this->current()?->is_closed ?? true);
        if ($closed ? array_key_exists('closed', $data) : array_key_exists('open', $data)) {
            $out['is_closed'] = $closed;
            $out['opens_at'] = $closed ? null : $data['open'];
            $out['closes_at'] = $closed ? null : $data['close'];
        }
        if (array_key_exists('note', $out) && $out['note'] === '') {
            $out['note'] = null;
        }

        return $out;
    }

    private function current(): ?SpecialOpeningHour
    {
        $model = $this->route('specialDate');

        return $model instanceof SpecialOpeningHour ? $model : null;
    }
}
