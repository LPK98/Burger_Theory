<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\OfferResource;
use App\Models\Coupon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * @tags Menu
 */
class OfferController extends Controller
{
    /**
     * Current public offers (advertised coupon codes).
     *
     * For discounted products use `GET /products?on_sale=1`.
     *
     * @unauthenticated
     */
    public function index(): AnonymousResourceCollection
    {
        $offers = Coupon::query()
            ->current()
            ->where('is_public', true)
            ->where(fn (Builder $q) => $q->whereNull('usage_limit')->orWhereColumn('times_used', '<', 'usage_limit'))
            ->orderByRaw('expires_at ASC NULLS LAST')
            ->get();

        return OfferResource::collection($offers);
    }
}
