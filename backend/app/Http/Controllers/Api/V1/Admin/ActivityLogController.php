<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\AdminActivityLogResource;
use App\Models\AdminActivityLog;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * @tags Admin · Activity log
 */
class ActivityLogController extends Controller
{
    /**
     * The administrator audit trail, newest first.
     *
     * Every successful admin write and every admin sign-in. `action` matches a prefix, so
     * `action=admin.products` finds every product change. `from` and `to` are dates
     * (YYYY-MM-DD) in the restaurant's timezone, inclusive.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $v = $request->validate([
            'user_id' => ['nullable', 'integer', 'min:1'],
            'action' => ['nullable', 'string', 'max:100'],
            'subject_type' => ['nullable', 'string', 'max:60'],
            'subject_id' => ['nullable', 'string', 'max:64'],
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);
        $tz = (string) config('restaurant.timezone');

        $logs = AdminActivityLog::query()
            ->with('user')
            ->when($v['user_id'] ?? null, fn ($q, int $id) => $q->where('user_id', $id))
            ->when($v['action'] ?? null, fn ($q, string $action) => $q->where('action', 'like', addcslashes($action, '%_\\').'%'))
            ->when($v['subject_type'] ?? null, fn ($q, string $type) => $q->where('subject_type', $type))
            ->when($v['subject_id'] ?? null, fn ($q, string $id) => $q->where('subject_id', $id))
            ->when($v['from'] ?? null, fn ($q, string $from) => $q->where('created_at', '>=', CarbonImmutable::createFromFormat('Y-m-d', $from, $tz)->startOfDay()->utc()))
            ->when($v['to'] ?? null, fn ($q, string $to) => $q->where('created_at', '<', CarbonImmutable::createFromFormat('Y-m-d', $to, $tz)->startOfDay()->addDay()->utc()))
            ->orderByDesc('id')
            ->paginate((int) ($v['per_page'] ?? 50))
            ->withQueryString();

        return AdminActivityLogResource::collection($logs);
    }
}
