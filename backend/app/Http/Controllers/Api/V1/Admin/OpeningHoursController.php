<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\UpdateOpeningHoursRequest;
use App\Models\SpecialOpeningHour;
use App\Services\Hours\OpeningHoursService;
use App\Services\Settings\RestaurantSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * @tags Admin · Opening hours
 */
class OpeningHoursController extends Controller
{
    public function __construct(
        private readonly OpeningHoursService $hours,
        private readonly RestaurantSettings $settings,
    ) {}

    /**
     * The weekly hours, every special date (upcoming first, then up to 50 past ones), the
     * temporary-closure switch, the announcement and the live status customers see.
     */
    public function show(): JsonResponse
    {
        return $this->respond();
    }

    /** Update the weekly hours, the temporary-closure switch and/or the announcement. */
    public function update(UpdateOpeningHoursRequest $request): JsonResponse
    {
        $data = $request->validated();

        DB::transaction(function () use ($data, $request) {
            if (isset($data['weekly'])) {
                $this->hours->updateWeekly($data['weekly'], $request->user());
            }
            $settings = [];
            if (array_key_exists('temporarily_closed', $data)) {
                $settings['temporarily_closed'] = $data['temporarily_closed'];
            }
            if (array_key_exists('announcement', $data)) {
                $settings['hours_announcement'] = $data['announcement'];
            }
            if ($settings !== []) {
                $this->settings->update($settings, $request->user());
            }
        });

        return $this->respond();
    }

    private function respond(): JsonResponse
    {
        $now = $this->hours->now();
        $today = $now->toDateString();
        $upcoming = SpecialOpeningHour::query()->whereDate('ends_on', '>=', $today)->orderBy('starts_on')->get();
        $past = SpecialOpeningHour::query()->whereDate('ends_on', '<', $today)->orderByDesc('starts_on')->limit(50)->get();

        return response()->json(['data' => [
            'timezone' => $this->hours->timezone(),
            'now' => $now->toIso8601String(),
            'today' => $today,
            'weekly' => $this->hours->weekly(),
            'temporarily_closed' => $this->hours->temporarilyClosed(),
            'announcement' => $this->hours->announcement(),
            'status' => $this->hours->status($now),
            'special_dates' => $upcoming->concat($past)->map(fn (SpecialOpeningHour $s) => $this->hours->special($s, $today))->values()->all(),
        ]]);
    }
}
