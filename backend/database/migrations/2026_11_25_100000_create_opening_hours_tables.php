<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Opening hours get their own tables:
 *
 *  - opening_hours:         the regular week, exactly one row per ISO weekday (1 = Monday … 7 = Sunday).
 *  - special_opening_hours: date ranges that replace the regular week, either closed (holidays,
 *                           temporary closures) or with special hours. Ranges never overlap.
 *
 * All times are wall-clock times in the restaurant timezone (config restaurant.timezone).
 * A closing time earlier than the opening time means the restaurant closes after midnight.
 *
 * The weekly hours used to be a JSON value in restaurant_settings ("opening_hours"). That value
 * is copied into the new table and then removed, so there is only one place they live.
 */
return new class extends Migration
{
    private const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    public function up(): void
    {
        Schema::create('opening_hours', function (Blueprint $table) {
            $table->id();
            $table->unsignedSmallInteger('day_of_week')->unique(); // ISO-8601: 1 = Monday, 7 = Sunday
            $table->boolean('is_open')->default(true);
            $table->time('opens_at')->nullable();
            $table->time('closes_at')->nullable();
            $table->foreignId('updated_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampsTz();
        });

        DB::statement('ALTER TABLE opening_hours ADD CONSTRAINT opening_hours_day_check CHECK (day_of_week BETWEEN 1 AND 7)');
        DB::statement('ALTER TABLE opening_hours ADD CONSTRAINT opening_hours_times_check CHECK (
            (is_open AND opens_at IS NOT NULL AND closes_at IS NOT NULL AND opens_at <> closes_at)
            OR (NOT is_open AND opens_at IS NULL AND closes_at IS NULL))');

        Schema::create('special_opening_hours', function (Blueprint $table) {
            $table->id();
            $table->date('starts_on');
            $table->date('ends_on'); // inclusive; equal to starts_on for a single day
            $table->boolean('is_closed')->default(true);
            $table->time('opens_at')->nullable();
            $table->time('closes_at')->nullable();
            $table->string('title', 80);              // "Christmas Day", "Kitchen renovation"
            $table->string('note', 255)->nullable();  // optional message shown to customers
            $table->foreignId('created_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampsTz();

            $table->index(['ends_on', 'starts_on']);
        });

        DB::statement('ALTER TABLE special_opening_hours ADD CONSTRAINT special_opening_hours_range_check CHECK (ends_on >= starts_on)');
        DB::statement('ALTER TABLE special_opening_hours ADD CONSTRAINT special_opening_hours_times_check CHECK (
            (is_closed AND opens_at IS NULL AND closes_at IS NULL)
            OR (NOT is_closed AND opens_at IS NOT NULL AND closes_at IS NOT NULL AND opens_at <> closes_at))');
        // Two special entries may never cover the same day (GiST indexes ranges natively).
        DB::statement("ALTER TABLE special_opening_hours ADD CONSTRAINT special_opening_hours_no_overlap
            EXCLUDE USING gist (daterange(starts_on, ends_on, '[]') WITH &&)");

        $this->copyWeeklyHoursFromSettings();
    }

    public function down(): void
    {
        // Put the weekly hours back into the settings store before the table goes.
        $rows = DB::table('opening_hours')->orderBy('day_of_week')->get();
        if ($rows->isNotEmpty()) {
            $hours = $rows->map(fn ($r) => [
                'day' => self::DAYS[$r->day_of_week - 1],
                'closed' => ! $r->is_open,
                'open' => $r->is_open ? substr((string) $r->opens_at, 0, 5) : null,
                'close' => $r->is_open ? substr((string) $r->closes_at, 0, 5) : null,
            ])->all();
            DB::table('restaurant_settings')->updateOrInsert(
                ['key' => 'opening_hours'],
                ['value' => json_encode($hours), 'created_at' => now(), 'updated_at' => now()],
            );
        }

        Schema::dropIfExists('special_opening_hours');
        Schema::dropIfExists('opening_hours');
    }

    private function copyWeeklyHoursFromSettings(): void
    {
        $stored = DB::table('restaurant_settings')->where('key', 'opening_hours')->value('value');
        $byDay = collect(is_string($stored) ? (json_decode($stored, true) ?: []) : [])
            ->filter(fn ($h) => is_array($h) && isset($h['day']))
            ->keyBy('day');

        $now = now();
        foreach (self::DAYS as $i => $day) {
            // Previous default: 11:00–22:30, until midnight on Friday and Saturday.
            $h = $byDay->get($day, [
                'closed' => false,
                'open' => '11:00',
                'close' => in_array($day, ['friday', 'saturday'], true) ? '23:59' : '22:30',
            ]);
            $open = ! ($h['closed'] ?? false) && ! empty($h['open']) && ! empty($h['close']) && $h['open'] !== $h['close'];

            DB::table('opening_hours')->insert([
                'day_of_week' => $i + 1,
                'is_open' => $open,
                'opens_at' => $open ? $h['open'] : null,
                'closes_at' => $open ? $h['close'] : null,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        DB::table('restaurant_settings')->where('key', 'opening_hours')->delete();
    }
};
