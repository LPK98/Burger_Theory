<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\PaymentMethod;
use App\Enums\PaymentStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\AdminPaymentResource;
use App\Models\Payment;
use App\Support\Money;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

/**
 * @tags Admin · Payments
 */
class PaymentController extends Controller
{
    /**
     * Payment attempts (PayHere and cash on delivery), newest first.
     *
     * A PayHere payment only becomes `paid` through a notification whose checksum the
     * server verified. `meta.summary` totals the filtered set; amounts are cents.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $v = $request->validate([
            'method' => ['nullable', Rule::enum(PaymentMethod::class)],
            'status' => ['nullable', Rule::enum(PaymentStatus::class)],
            /** Created on or after this date (restaurant timezone). */
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:date_from'],
            /** Payment reference, PayHere payment id, order number, customer name or email. */
            'search' => ['nullable', 'string', 'max:100'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);
        $tz = (string) config('restaurant.timezone');

        $query = Payment::query()
            ->when($v['method'] ?? null, fn (Builder $q, $m) => $q->where('method', $m))
            ->when($v['status'] ?? null, fn (Builder $q, $s) => $q->where('status', $s))
            ->when($v['date_from'] ?? null, fn (Builder $q, $d) => $q->where('payments.created_at', '>=', CarbonImmutable::createFromFormat('Y-m-d', $d, $tz)->startOfDay()->utc()))
            ->when($v['date_to'] ?? null, fn (Builder $q, $d) => $q->where('payments.created_at', '<', CarbonImmutable::createFromFormat('Y-m-d', $d, $tz)->startOfDay()->addDay()->utc()))
            ->when($v['search'] ?? null, function (Builder $q, string $term) {
                $like = '%'.addcslashes($term, '%_\\').'%';
                $q->where(fn (Builder $s) => $s->where('reference', 'ilike', $like)
                    ->orWhere('provider_payment_id', 'ilike', $like)
                    ->orWhereHas('order', fn (Builder $o) => $o->where('order_number', 'ilike', $like)
                        ->orWhere('customer_name', 'ilike', $like)
                        ->orWhere('customer_email', 'ilike', $like)));
            });

        $summary = $query->clone()->toBase()
            ->selectRaw('COUNT(*) AS payments')
            ->selectRaw('COALESCE(SUM(amount) FILTER (WHERE status = ?), 0) AS paid_amount', [PaymentStatus::Paid->value])
            ->selectRaw('COUNT(*) FILTER (WHERE status = ?) AS paid', [PaymentStatus::Paid->value])
            ->selectRaw('COALESCE(SUM(amount) FILTER (WHERE status = ?), 0) AS pending_amount', [PaymentStatus::Pending->value])
            ->selectRaw('COUNT(*) FILTER (WHERE status = ?) AS pending', [PaymentStatus::Pending->value])
            ->selectRaw('COUNT(*) FILTER (WHERE status IN (?, ?)) AS failed', [PaymentStatus::Failed->value, PaymentStatus::Cancelled->value])
            ->selectRaw('COUNT(*) FILTER (WHERE status IN (?, ?)) AS needs_attention', [PaymentStatus::RefundRequired->value, PaymentStatus::ChargedBack->value])
            ->first();

        $payments = $query->with(['order', 'collectedBy'])
            ->latest('payments.id')
            ->paginate((int) ($v['per_page'] ?? 20))
            ->withQueryString();

        return AdminPaymentResource::collection($payments)->additional(['meta' => ['summary' => [
            'currency' => (string) config('restaurant.currency'),
            'payments' => (int) $summary->payments,
            'paid' => (int) $summary->paid,
            'paid_amount' => Money::toMinor((string) $summary->paid_amount),
            'pending' => (int) $summary->pending,
            'pending_amount' => Money::toMinor((string) $summary->pending_amount),
            'failed' => (int) $summary->failed,
            'needs_attention' => (int) $summary->needs_attention,
        ]]]);
    }

    /** One payment with its order and the PayHere notifications received for it. */
    public function show(Payment $payment): AdminPaymentResource
    {
        return new AdminPaymentResource($payment->load(['order', 'collectedBy', 'events']));
    }
}
