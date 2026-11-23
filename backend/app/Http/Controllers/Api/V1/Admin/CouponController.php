<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\CouponRequest;
use App\Http\Resources\CouponResource;
use App\Models\Coupon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

/**
 * @tags Admin · Coupons
 */
class CouponController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $coupons = Coupon::query()
            ->when($request->filled('search'), fn ($q) => $q->where('code', 'ilike', '%'.addcslashes(Coupon::normalizeCode($request->string('search')), '%_\\').'%'))
            ->when($request->has('is_active'), fn ($q) => $q->where('is_active', $request->boolean('is_active')))
            ->latest('id')
            ->paginate(min(100, max(1, $request->integer('per_page', 25))));

        return CouponResource::collection($coupons);
    }

    /** Create a coupon. `amount`/limits in cents; `percentage` 1–100. */
    public function store(CouponRequest $request): JsonResponse
    {
        $coupon = Coupon::query()->create($request->couponData());

        return (new CouponResource($coupon))->response()->setStatusCode(201);
    }

    public function show(Coupon $coupon): CouponResource
    {
        return new CouponResource($coupon);
    }

    public function update(CouponRequest $request, Coupon $coupon): CouponResource
    {
        $coupon->update($request->couponData());

        return new CouponResource($coupon);
    }

    /** Delete a coupon (soft delete; past orders keep the code they used). */
    public function destroy(Coupon $coupon): Response
    {
        $coupon->delete();

        return response()->noContent();
    }
}
