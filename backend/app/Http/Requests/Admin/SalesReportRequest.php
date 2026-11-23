<?php

namespace App\Http\Requests\Admin;

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class SalesReportRequest extends FormRequest
{
    private const LIMITS = ['day' => 366, 'week' => 104, 'month' => 60];

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            /** "day" (default, last 30 days), "week" (Monday start, last 12 weeks) or "month" (last 12 months). */
            'interval' => ['nullable', 'in:day,week,month'],
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
        ];
    }

    /** @return list<callable> */
    public function after(): array
    {
        return [function (Validator $validator) {
            if ($validator->errors()->isNotEmpty()) {
                return;
            }
            [$from, $to] = $this->range();
            $interval = $this->granularity();
            $limit = self::LIMITS[$interval];
            $span = match ($interval) {
                'month' => $from->diffInMonths($to),
                'week' => $from->diffInWeeks($to),
                default => $from->diffInDays($to),
            };
            if ($span > $limit) {
                $validator->errors()->add('from', "The range may span at most {$limit} {$interval}s.");
            }
        }];
    }

    public function granularity(): string
    {
        return $this->input('interval', 'day');
    }

    /** @return array{0: CarbonImmutable, 1: CarbonImmutable} In the restaurant timezone. */
    public function range(): array
    {
        $tz = (string) config('restaurant.timezone');
        $to = $this->filled('to') ? CarbonImmutable::createFromFormat('Y-m-d', $this->input('to'), $tz) : CarbonImmutable::now($tz);
        $from = $this->filled('from')
            ? CarbonImmutable::createFromFormat('Y-m-d', $this->input('from'), $tz)
            : match ($this->granularity()) {
                'month' => $to->subMonthsNoOverflow(11)->startOfMonth(),
                'week' => $to->subWeeks(11),
                default => $to->subDays(29),
            };

        return [$from->startOfDay(), $to->startOfDay()];
    }
}
