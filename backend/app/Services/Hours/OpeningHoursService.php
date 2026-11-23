<?php

namespace App\Services\Hours;

use App\Models\OpeningHour;
use App\Models\SpecialOpeningHour;
use App\Models\User;
use App\Services\Settings\RestaurantSettings;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * The restaurant's opening hours and its live open/closed status.
 *
 * Everything is computed in the restaurant timezone (config restaurant.timezone, Asia/Colombo),
 * never the customer's device. For any date the effective schedule is, in order:
 *
 *  1. a special entry covering that date (closed, or special hours), else
 *  2. the regular weekly hours for that weekday.
 *
 * A closing time earlier than the opening time means the shift ends after midnight; the hours
 * after midnight still belong to the shift that started the day before (so a Friday 18:00–02:00
 * shift keeps the restaurant open at 01:00 on Saturday, even if Saturday itself is closed).
 * A closing time of 23:59 is read as "until midnight".
 *
 * On top of that, the "temporarily closed" switch closes the restaurant until an admin turns it off.
 */
class OpeningHoursService
{
    public const DAYS = RestaurantSettings::DAYS;

    /** "Closing soon" when the current shift ends within this many minutes. */
    public const CLOSING_SOON_MINUTES = 30;

    /** How far ahead to look for the next opening. */
    private const LOOKAHEAD_DAYS = 120;

    /** How many upcoming special entries the public endpoint lists. */
    private const PUBLIC_SPECIAL_LIMIT = 12;

    public function __construct(private readonly RestaurantSettings $settings) {}

    public function timezone(): string
    {
        return (string) config('restaurant.timezone');
    }

    public function now(): CarbonImmutable
    {
        return CarbonImmutable::now($this->timezone());
    }

    /**
     * The regular week, Monday first.
     *
     * @return list<array{day: string, closed: bool, open: ?string, close: ?string, overnight: bool}>
     */
    public function weekly(): array
    {
        $rows = OpeningHour::query()->get()->keyBy('day_of_week');

        return array_map(function (string $day) use ($rows) {
            /** @var OpeningHour|null $row */
            $row = $rows->get(array_search($day, self::DAYS, true) + 1);
            $open = $row !== null && $row->is_open;

            return $this->hours($day, ! $open, $open ? $row->opens_at : null, $open ? $row->closes_at : null);
        }, self::DAYS);
    }

    /**
     * Replace the regular week.
     *
     * @param  list<array{day: string, closed: bool, open?: ?string, close?: ?string}>  $hours  Validated, seven entries.
     */
    public function updateWeekly(array $hours, ?User $by = null): void
    {
        DB::transaction(function () use ($hours, $by) {
            foreach ($hours as $h) {
                $open = ! $h['closed'];
                OpeningHour::query()->updateOrCreate(
                    ['day_of_week' => array_search($h['day'], self::DAYS, true) + 1],
                    [
                        'is_open' => $open,
                        'opens_at' => $open ? $h['open'] : null,
                        'closes_at' => $open ? $h['close'] : null,
                        'updated_by_id' => $by?->id,
                    ],
                );
            }
        });
    }

    public function temporarilyClosed(): bool
    {
        return (bool) $this->settings->all()['temporarily_closed'];
    }

    public function announcement(): ?string
    {
        return $this->settings->all()['hours_announcement'];
    }

    /**
     * The effective schedule of every date from $from to $to (inclusive), keyed by Y-m-d.
     *
     * @return array<string, array{date: string, day: string, closed: bool, open: ?string, close: ?string, overnight: bool, special: ?array{id: int, title: string, note: ?string}}>
     */
    public function scheduleBetween(CarbonImmutable $from, CarbonImmutable $to): array
    {
        $weekly = $this->weekly();
        $specials = SpecialOpeningHour::query()
            ->covering($from->toDateString(), $to->toDateString())
            ->orderBy('starts_on')
            ->get();

        $days = [];
        for ($date = $from->startOfDay(); $date->lte($to); $date = $date->addDay()) {
            $key = $date->toDateString();
            $special = $specials->first(fn (SpecialOpeningHour $s) => $s->starts_on->toDateString() <= $key && $s->ends_on->toDateString() >= $key);
            $base = $special === null
                ? $weekly[$date->dayOfWeekIso - 1]
                : $this->hours(self::DAYS[$date->dayOfWeekIso - 1], $special->is_closed, $special->opens_at, $special->closes_at);

            $days[$key] = ['date' => $key] + $base + ['special' => $special === null ? null : [
                'id' => $special->id,
                'title' => $special->title,
                'note' => $special->note,
            ]];
        }

        return $days;
    }

    /**
     * Whether the restaurant is open at $at (default now), when it closes, and when it next opens.
     *
     * @return array{state: string, is_open: bool, closing_soon: bool, closes_at: ?string, next_opening: ?array{at: string, date: string, day: string, time: string}, reason: ?array{title: string, note: ?string}}
     */
    public function status(?CarbonImmutable $at = null): array
    {
        $now = ($at ?? $this->now())->setTimezone($this->timezone());
        $schedule = $this->scheduleBetween($now->subDay()->startOfDay(), $now->addDays(self::LOOKAHEAD_DAYS));
        $today = $schedule[$now->toDateString()];
        $todaysSpecial = $today['special'] === null ? null : ['title' => $today['special']['title'], 'note' => $today['special']['note']];

        if ($this->temporarilyClosed()) {
            return [
                'state' => 'temporarily_closed',
                'is_open' => false,
                'closing_soon' => false,
                'closes_at' => null,
                // Nobody knows when an admin will reopen, so no promise is made.
                'next_opening' => null,
                'reason' => null,
            ];
        }

        $shifts = $this->shifts($schedule);

        foreach ($shifts as $i => [$start, $end, $day]) {
            if ($start->lte($now) && $now->lt($end)) {
                // Back-to-back shifts (e.g. open around the clock) read as one.
                while (isset($shifts[$i + 1]) && $shifts[$i + 1][0]->lte($end)) {
                    $end = $end->max($shifts[++$i][1]);
                }
                $special = $day['special'] === null ? null : ['title' => $day['special']['title'], 'note' => $day['special']['note']];

                return [
                    'state' => 'open',
                    'is_open' => true,
                    'closing_soon' => $now->diffInMinutes($end) <= self::CLOSING_SOON_MINUTES,
                    'closes_at' => $end->toIso8601String(),
                    'next_opening' => null,
                    'reason' => $special,
                ];
            }
        }

        $next = collect($shifts)->first(fn ($s) => $s[0]->gt($now));

        return [
            'state' => 'closed',
            'is_open' => false,
            'closing_soon' => false,
            'closes_at' => null,
            'next_opening' => $next === null ? null : [
                'at' => $next[0]->toIso8601String(),
                'date' => $next[0]->toDateString(),
                'day' => self::DAYS[$next[0]->dayOfWeekIso - 1],
                'time' => $next[0]->format('H:i'),
            ],
            'reason' => $today['closed'] ? $todaysSpecial : null,
        ];
    }

    /**
     * Everything the website needs for its hours panel.
     *
     * @return array<string, mixed>
     */
    public function publicPayload(?CarbonImmutable $at = null): array
    {
        $now = ($at ?? $this->now())->setTimezone($this->timezone());
        $today = $now->toDateString();

        $upcoming = SpecialOpeningHour::query()
            ->whereDate('ends_on', '>=', $today)
            ->orderBy('starts_on')
            ->limit(self::PUBLIC_SPECIAL_LIMIT)
            ->get();

        return [
            'timezone' => $this->timezone(),
            'now' => $now->toIso8601String(),
            'today' => $today,
            'status' => $this->status($now),
            'temporarily_closed' => $this->temporarilyClosed(),
            'announcement' => $this->announcement(),
            'weekly' => $this->weekly(),
            // The next seven days as they will really be (special dates applied), today first.
            'week' => array_values($this->scheduleBetween($now->startOfDay(), $now->addDays(6))),
            'special_dates' => $upcoming->map(fn (SpecialOpeningHour $s) => $this->special($s, $today))->all(),
        ];
    }

    /** @return array<string, mixed> */
    public function special(SpecialOpeningHour $s, ?string $today = null): array
    {
        $today ??= $this->now()->toDateString();
        $hours = $this->hours('', $s->is_closed, $s->opens_at, $s->closes_at);

        return [
            'id' => $s->id,
            'starts_on' => $s->starts_on->toDateString(),
            'ends_on' => $s->ends_on->toDateString(),
            'closed' => $hours['closed'],
            'open' => $hours['open'],
            'close' => $hours['close'],
            'overnight' => $hours['overnight'],
            'title' => $s->title,
            'note' => $s->note,
            'is_active' => $s->starts_on->toDateString() <= $today && $s->ends_on->toDateString() >= $today,
            'is_past' => $s->ends_on->toDateString() < $today,
        ];
    }

    /**
     * Opening intervals, in order, for every open day of the schedule.
     *
     * @param  array<string, array<string, mixed>>  $schedule
     * @return list<array{0: CarbonImmutable, 1: CarbonImmutable, 2: array<string, mixed>}>
     */
    private function shifts(array $schedule): array
    {
        $tz = $this->timezone();
        $shifts = [];
        foreach ($schedule as $date => $day) {
            if ($day['closed']) {
                continue;
            }
            $start = CarbonImmutable::parse("{$date} {$day['open']}", $tz);
            $end = $day['close'] === '23:59'
                ? $start->startOfDay()->addDay()
                : CarbonImmutable::parse("{$date} {$day['close']}", $tz);
            if ($end->lte($start)) {
                $end = $end->addDay(); // closes after midnight
            }
            $shifts[] = [$start, $end, $day];
        }

        return $shifts;
    }

    /** @return array{day: string, closed: bool, open: ?string, close: ?string, overnight: bool} */
    private function hours(string $day, bool $closed, ?string $open, ?string $close): array
    {
        $open = $closed || $open === null ? null : substr($open, 0, 5);
        $close = $closed || $close === null ? null : substr($close, 0, 5);
        $closed = $closed || $open === null || $close === null;

        $hours = [
            'day' => $day,
            'closed' => $closed,
            'open' => $closed ? null : $open,
            'close' => $closed ? null : $close,
            // Ends after midnight (a close of exactly 00:00 is just "midnight").
            'overnight' => ! $closed && $close < $open && $close !== '00:00',
        ];

        return $hours;
    }
}
