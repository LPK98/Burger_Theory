<?php

namespace Tests\Feature\Hours;

use App\Models\AdminActivityLog;
use App\Models\OpeningHour;
use App\Models\SpecialOpeningHour;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The weekly table starts with the migration's defaults: 11:00–22:30 every day, until midnight
 * (23:59) on Friday and Saturday. 23 Nov 2026 is a Monday.
 */
class OpeningHoursTest extends TestCase
{
    use RefreshDatabase;

    private const TZ = 'Asia/Colombo';

    private const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    private function at(string $local): void
    {
        $this->travelTo(CarbonImmutable::parse($local, self::TZ));
    }

    /** @param  array<string, array{0: string, 1: string}|null>  $changes  day => [open, close], or null for closed */
    private function week(array $changes = []): array
    {
        return array_map(function (string $day) use ($changes) {
            $h = array_key_exists($day, $changes) ? $changes[$day] : ['11:00', '22:30'];

            return $h === null
                ? ['day' => $day, 'closed' => true]
                : ['day' => $day, 'closed' => false, 'open' => $h[0], 'close' => $h[1]];
        }, self::DAYS);
    }

    private function special(array $attributes): SpecialOpeningHour
    {
        return SpecialOpeningHour::query()->create($attributes + ['is_closed' => true, 'title' => 'Holiday']);
    }

    public function test_the_migration_seeds_seven_days_and_the_public_endpoint_shows_them(): void
    {
        $this->assertSame(7, OpeningHour::query()->count());
        $this->at('2026-11-23 14:00');

        $this->getJson('/api/v1/opening-hours')
            ->assertOk()
            ->assertHeader('Cache-Control', 'max-age=30, public')
            ->assertJsonPath('data.timezone', self::TZ)
            ->assertJsonPath('data.today', '2026-11-23')
            ->assertJsonPath('data.weekly.0', ['day' => 'monday', 'closed' => false, 'open' => '11:00', 'close' => '22:30', 'overnight' => false])
            ->assertJsonPath('data.weekly.4.close', '23:59')
            ->assertJsonCount(7, 'data.weekly')
            ->assertJsonCount(7, 'data.week')
            ->assertJsonPath('data.week.0.date', '2026-11-23')
            ->assertJsonPath('data.status.state', 'open')
            ->assertJsonPath('data.status.is_open', true)
            ->assertJsonPath('data.status.closing_soon', false)
            ->assertJsonPath('data.status.closes_at', '2026-11-23T22:30:00+05:30')
            ->assertJsonPath('data.status.next_opening', null)
            ->assertJsonPath('data.announcement', null)
            ->assertJsonPath('data.special_dates', []);
    }

    public function test_status_uses_colombo_time_not_utc(): void
    {
        // 20:00 UTC on Monday is already 01:30 on Tuesday in Colombo.
        $this->travelTo(CarbonImmutable::parse('2026-11-23 20:00', 'UTC'));

        $this->getJson('/api/v1/opening-hours')
            ->assertJsonPath('data.today', '2026-11-24')
            ->assertJsonPath('data.status.state', 'closed')
            ->assertJsonPath('data.status.next_opening', ['at' => '2026-11-24T11:00:00+05:30', 'date' => '2026-11-24', 'day' => 'tuesday', 'time' => '11:00']);
    }

    public function test_closing_soon_and_closed_after_hours(): void
    {
        $this->at('2026-11-23 22:05');
        $this->getJson('/api/v1/opening-hours')->assertJsonPath('data.status.state', 'open')->assertJsonPath('data.status.closing_soon', true);

        $this->at('2026-11-23 22:30');
        $this->getJson('/api/v1/opening-hours')
            ->assertJsonPath('data.status.state', 'closed')
            ->assertJsonPath('data.status.next_opening.date', '2026-11-24');

        // Before opening on the same day, the next opening is today.
        $this->at('2026-11-23 09:00');
        $this->getJson('/api/v1/opening-hours')->assertJsonPath('data.status.next_opening.at', '2026-11-23T11:00:00+05:30');
    }

    public function test_a_closed_day_is_skipped_when_finding_the_next_opening(): void
    {
        $this->putJson('/api/v1/admin/opening-hours', ['weekly' => $this->week(['tuesday' => null])], $this->bearer($this->admin()))
            ->assertOk()
            ->assertJsonPath('data.weekly.1', ['day' => 'tuesday', 'closed' => true, 'open' => null, 'close' => null, 'overnight' => false]);

        $this->at('2026-11-23 23:00');
        $this->getJson('/api/v1/opening-hours')
            ->assertJsonPath('data.status.state', 'closed')
            ->assertJsonPath('data.status.next_opening.day', 'wednesday')
            ->assertJsonPath('data.status.next_opening.date', '2026-11-25');
    }

    public function test_overnight_hours_carry_into_the_next_day(): void
    {
        $this->putJson('/api/v1/admin/opening-hours', ['weekly' => $this->week(['friday' => ['18:00', '02:00'], 'saturday' => null])], $this->bearer($this->admin()))
            ->assertOk()
            ->assertJsonPath('data.weekly.4.overnight', true);

        // 01:00 on Saturday (a closed day) still belongs to Friday's shift.
        $this->at('2026-11-28 01:00');
        $this->getJson('/api/v1/opening-hours')
            ->assertJsonPath('data.status.state', 'open')
            ->assertJsonPath('data.status.closes_at', '2026-11-28T02:00:00+05:30');

        $this->at('2026-11-28 02:00');
        $this->getJson('/api/v1/opening-hours')
            ->assertJsonPath('data.status.state', 'closed')
            ->assertJsonPath('data.status.next_opening.at', '2026-11-29T11:00:00+05:30');

        $this->at('2026-11-27 23:30');
        $this->getJson('/api/v1/opening-hours')->assertJsonPath('data.status.state', 'open');
    }

    public function test_until_midnight_and_round_the_clock_shifts_join_up(): void
    {
        // Saturday 23:59 means midnight, and Sunday opening at 00:00 makes one continuous shift.
        $this->putJson('/api/v1/admin/opening-hours', ['weekly' => $this->week(['saturday' => ['11:00', '23:59'], 'sunday' => ['00:00', '20:00']])], $this->bearer($this->admin()))->assertOk();

        $this->at('2026-11-28 23:59:30');
        $this->getJson('/api/v1/opening-hours')
            ->assertJsonPath('data.status.state', 'open')
            ->assertJsonPath('data.status.closes_at', '2026-11-29T20:00:00+05:30');
    }

    public function test_a_special_closed_date_overrides_the_week(): void
    {
        $this->special(['starts_on' => '2026-12-25', 'ends_on' => '2026-12-25', 'title' => 'Christmas Day', 'note' => 'Merry Christmas!']);
        $this->at('2026-12-25 12:00');

        $this->getJson('/api/v1/opening-hours')
            ->assertJsonPath('data.status.state', 'closed')
            ->assertJsonPath('data.status.reason', ['title' => 'Christmas Day', 'note' => 'Merry Christmas!'])
            ->assertJsonPath('data.status.next_opening.at', '2026-12-26T11:00:00+05:30')
            ->assertJsonPath('data.week.0.closed', true)
            ->assertJsonPath('data.week.0.special.title', 'Christmas Day')
            ->assertJsonPath('data.week.1.special', null)
            ->assertJsonPath('data.special_dates.0.title', 'Christmas Day')
            ->assertJsonPath('data.special_dates.0.is_active', true);
    }

    public function test_a_temporary_closure_range_pushes_the_next_opening_past_it(): void
    {
        $this->special(['starts_on' => '2026-11-24', 'ends_on' => '2026-11-30', 'title' => 'Kitchen renovation']);
        $this->at('2026-11-23 23:00');

        $this->getJson('/api/v1/opening-hours')
            ->assertJsonPath('data.status.next_opening.date', '2026-12-01')
            ->assertJsonPath('data.special_dates.0.is_active', false);
    }

    public function test_special_hours_replace_the_day(): void
    {
        $this->special(['starts_on' => '2026-12-24', 'ends_on' => '2026-12-24', 'is_closed' => false, 'opens_at' => '10:00', 'closes_at' => '16:00', 'title' => 'Christmas Eve']);

        $this->at('2026-12-24 10:30');
        $this->getJson('/api/v1/opening-hours')
            ->assertJsonPath('data.status.state', 'open')
            ->assertJsonPath('data.status.closes_at', '2026-12-24T16:00:00+05:30')
            ->assertJsonPath('data.status.reason.title', 'Christmas Eve')
            ->assertJsonPath('data.week.0.open', '10:00');

        $this->at('2026-12-24 17:00');
        $this->getJson('/api/v1/opening-hours')
            ->assertJsonPath('data.status.state', 'closed')
            ->assertJsonPath('data.status.next_opening.at', '2026-12-25T11:00:00+05:30');
    }

    public function test_the_temporary_closure_switch_and_announcement(): void
    {
        $headers = $this->bearer($this->admin());
        $this->at('2026-11-23 14:00');

        $this->patchJson('/api/v1/admin/opening-hours', ['temporarily_closed' => true, 'announcement' => '  Closed today for a private event.  '], $headers)
            ->assertOk()
            ->assertJsonPath('data.temporarily_closed', true)
            ->assertJsonPath('data.announcement', 'Closed today for a private event.')
            ->assertJsonPath('data.status.state', 'temporarily_closed');

        $this->getJson('/api/v1/opening-hours')
            ->assertJsonPath('data.status.state', 'temporarily_closed')
            ->assertJsonPath('data.status.is_open', false)
            ->assertJsonPath('data.status.next_opening', null)
            ->assertJsonPath('data.announcement', 'Closed today for a private event.');

        $this->patchJson('/api/v1/admin/opening-hours', ['temporarily_closed' => false, 'announcement' => ''], $headers)->assertOk();
        $this->getJson('/api/v1/opening-hours')
            ->assertJsonPath('data.status.state', 'open')
            ->assertJsonPath('data.announcement', null);
    }

    public function test_only_admins_manage_opening_hours(): void
    {
        $this->getJson('/api/v1/admin/opening-hours')->assertUnauthorized();
        $this->putJson('/api/v1/admin/opening-hours', ['temporarily_closed' => true])->assertUnauthorized();

        $customer = $this->bearer($this->customer());
        $this->getJson('/api/v1/admin/opening-hours', $customer)->assertForbidden();
        $this->putJson('/api/v1/admin/opening-hours', ['temporarily_closed' => true], $customer)->assertForbidden();
        $this->postJson('/api/v1/admin/opening-hours/special-dates', ['starts_on' => '2030-01-01', 'closed' => true, 'title' => 'x'], $customer)->assertForbidden();

        $this->assertDatabaseCount('special_opening_hours', 0);
        $this->getJson('/api/v1/opening-hours')->assertJsonPath('data.temporarily_closed', false);
    }

    public function test_weekly_hours_are_validated(): void
    {
        $headers = $this->bearer($this->admin());

        $bad = $this->week();
        $bad[2]['open'] = '25:00';
        $bad[3]['close'] = $bad[3]['open'];
        unset($bad[5]['close']);
        $this->putJson('/api/v1/admin/opening-hours', ['weekly' => $bad, 'announcement' => str_repeat('a', 501)], $headers)
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['weekly.2.open', 'weekly.3.close', 'weekly.5.close', 'announcement']);

        $this->putJson('/api/v1/admin/opening-hours', ['weekly' => array_slice($this->week(), 0, 6)], $headers)
            ->assertUnprocessable()->assertJsonValidationErrors('weekly');

        $dupe = $this->week();
        $dupe[6]['day'] = 'monday';
        $this->putJson('/api/v1/admin/opening-hours', ['weekly' => $dupe], $headers)
            ->assertUnprocessable()->assertJsonValidationErrors('weekly.6.day');

        // Nothing was written.
        $this->assertSame('11:00:00', OpeningHour::query()->where('day_of_week', 3)->value('opens_at'));
    }

    public function test_special_dates_can_be_created_updated_and_deleted(): void
    {
        $admin = $this->admin();
        $headers = $this->bearer($admin);
        $this->at('2026-11-23 14:00');

        $id = $this->postJson('/api/v1/admin/opening-hours/special-dates', ['starts_on' => '2026-12-25', 'closed' => true, 'title' => ' Christmas Day ', 'note' => ''], $headers)
            ->assertCreated()
            ->assertJsonPath('data.starts_on', '2026-12-25')
            ->assertJsonPath('data.ends_on', '2026-12-25')
            ->assertJsonPath('data.closed', true)
            ->assertJsonPath('data.open', null)
            ->assertJsonPath('data.title', 'Christmas Day')
            ->assertJsonPath('data.note', null)
            ->json('data.id');

        $this->patchJson("/api/v1/admin/opening-hours/special-dates/{$id}", ['closed' => false, 'open' => '18:00', 'close' => '01:00'], $headers)
            ->assertOk()
            ->assertJsonPath('data.closed', false)
            ->assertJsonPath('data.open', '18:00')
            ->assertJsonPath('data.close', '01:00')
            ->assertJsonPath('data.overnight', true)
            ->assertJsonPath('data.title', 'Christmas Day');

        $this->patchJson("/api/v1/admin/opening-hours/special-dates/{$id}", ['title' => 'Christmas'], $headers)
            ->assertOk()->assertJsonPath('data.open', '18:00');

        $this->getJson('/api/v1/admin/opening-hours', $headers)
            ->assertOk()
            ->assertJsonPath('data.special_dates.0.id', $id)
            ->assertJsonPath('data.special_dates.0.is_past', false);

        $this->deleteJson("/api/v1/admin/opening-hours/special-dates/{$id}", [], $headers)->assertNoContent();
        $this->assertDatabaseCount('special_opening_hours', 0);

        $this->assertSame(
            ['admin.opening-hours.special-dates.store', 'admin.opening-hours.special-dates.update', 'admin.opening-hours.special-dates.update', 'admin.opening-hours.special-dates.destroy'],
            AdminActivityLog::query()->where('user_id', $admin->id)->orderBy('id')->pluck('action')->all(),
        );
    }

    public function test_special_dates_are_validated(): void
    {
        $headers = $this->bearer($this->admin());
        $this->at('2026-11-23 14:00');
        $url = '/api/v1/admin/opening-hours/special-dates';

        $this->postJson($url, ['starts_on' => '2026-12-31', 'ends_on' => '2026-12-30', 'closed' => true, 'title' => 'New Year'], $headers)
            ->assertUnprocessable()->assertJsonValidationErrors('ends_on');
        $this->postJson($url, ['starts_on' => '2026-11-01', 'ends_on' => '2026-11-22', 'closed' => true, 'title' => 'Past'], $headers)
            ->assertUnprocessable()->assertJsonValidationErrors('ends_on');
        $this->postJson($url, ['starts_on' => '2026-12-01', 'ends_on' => '2028-01-01', 'closed' => true, 'title' => 'Too long'], $headers)
            ->assertUnprocessable()->assertJsonValidationErrors('ends_on');
        $this->postJson($url, ['starts_on' => '2026-02-30', 'closed' => false, 'open' => '9:00', 'close' => '18:00'], $headers)
            ->assertUnprocessable()->assertJsonValidationErrors(['starts_on', 'open', 'title']);
        $this->postJson($url, ['starts_on' => '2026-12-24', 'closed' => false, 'open' => '10:00', 'close' => '10:00', 'title' => 'Eve'], $headers)
            ->assertUnprocessable()->assertJsonValidationErrors('close');

        $this->postJson($url, ['starts_on' => '2026-12-24', 'ends_on' => '2026-12-26', 'closed' => true, 'title' => 'Christmas break'], $headers)->assertCreated();
        $this->postJson($url, ['starts_on' => '2026-12-26', 'ends_on' => '2026-12-27', 'closed' => true, 'title' => 'Overlap'], $headers)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('starts_on')
            ->assertJsonPath('errors.starts_on.0', 'These dates overlap “Christmas break” (24 Dec – 26 Dec 2026).');
        // Adjacent ranges are fine.
        $this->postJson($url, ['starts_on' => '2026-12-27', 'closed' => true, 'title' => 'Day after'], $headers)->assertCreated();

        $this->assertDatabaseCount('special_opening_hours', 2);
    }
}
