<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Hours\OpeningHoursService;
use Illuminate\Http\JsonResponse;

/**
 * @tags Menu
 */
class OpeningHoursController extends Controller
{
    /**
     * Opening hours and whether the restaurant is open right now.
     *
     * Computed in the restaurant timezone (`timezone`, Asia/Colombo), never the visitor's. `weekly`
     * is the regular week (Monday first); `week` is the next seven days with special dates applied,
     * today first; `special_dates` lists upcoming holidays and special hours. Times are "HH:MM";
     * a `close` earlier than `open` (`overnight: true`) ends after midnight, and "23:59" means midnight.
     * `status.state` is `open`, `closed` or `temporarily_closed`.
     *
     * @unauthenticated
     */
    public function show(OpeningHoursService $hours): JsonResponse
    {
        return response()
            ->json(['data' => $hours->publicPayload()])
            ->header('Cache-Control', 'public, max-age=30');
    }
}
