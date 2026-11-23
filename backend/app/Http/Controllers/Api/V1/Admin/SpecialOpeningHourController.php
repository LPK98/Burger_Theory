<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\SpecialOpeningHourRequest;
use App\Models\SpecialOpeningHour;
use App\Services\Hours\OpeningHoursService;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Validation\ValidationException;

/**
 * Holidays, temporary closures and days with special hours. Each entry covers a date range
 * (inclusive) and replaces the weekly hours on those days.
 *
 * @tags Admin · Opening hours
 */
class SpecialOpeningHourController extends Controller
{
    public function __construct(private readonly OpeningHoursService $hours) {}

    /** Upcoming entries first (soonest first), then past ones (most recent first). */
    public function index(): JsonResponse
    {
        $today = $this->hours->now()->toDateString();
        $upcoming = SpecialOpeningHour::query()->whereDate('ends_on', '>=', $today)->orderBy('starts_on')->get();
        $past = SpecialOpeningHour::query()->whereDate('ends_on', '<', $today)->orderByDesc('starts_on')->limit(50)->get();

        return response()->json(['data' => $upcoming->concat($past)->map(fn ($s) => $this->hours->special($s, $today))->values()]);
    }

    /** Add a closed date/range or special hours. `ends_on` defaults to `starts_on`. */
    public function store(SpecialOpeningHourRequest $request): JsonResponse
    {
        $special = $this->guardOverlap(fn () => SpecialOpeningHour::query()->create($request->specialData() + [
            'created_by_id' => $request->user()->id,
            'updated_by_id' => $request->user()->id,
        ]));

        return response()->json(['data' => $this->hours->special($special->refresh())], 201);
    }

    public function show(SpecialOpeningHour $specialDate): JsonResponse
    {
        return response()->json(['data' => $this->hours->special($specialDate)]);
    }

    public function update(SpecialOpeningHourRequest $request, SpecialOpeningHour $specialDate): JsonResponse
    {
        $this->guardOverlap(fn () => $specialDate->update($request->specialData() + ['updated_by_id' => $request->user()->id]));

        return response()->json(['data' => $this->hours->special($specialDate->refresh())]);
    }

    public function destroy(SpecialOpeningHour $specialDate): Response
    {
        $specialDate->delete();

        return response()->noContent();
    }

    /**
     * The request checks for overlaps, but two saves at the same moment could both pass; the
     * database's exclusion constraint then rejects one, which becomes the same validation error.
     *
     * @template T
     *
     * @param  callable(): T  $write
     * @return T
     */
    private function guardOverlap(callable $write): mixed
    {
        try {
            return $write();
        } catch (QueryException $e) {
            if ($e->getCode() === '23P01') { // exclusion_violation
                throw ValidationException::withMessages(['starts_on' => 'These dates overlap another special date.']);
            }
            throw $e;
        }
    }
}
