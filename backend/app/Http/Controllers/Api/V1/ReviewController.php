<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\OrderStatus;
use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\ReviewRequest;
use App\Http\Resources\ReviewResource;
use App\Models\Order;
use App\Models\Product;
use App\Models\Review;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

/**
 * @tags Reviews
 */
class ReviewController extends Controller
{
    /**
     * Published reviews for a product.
     *
     * @unauthenticated
     */
    public function index(Request $request, Product $product): AnonymousResourceCollection
    {
        $reviews = $product->reviews()
            ->published()
            ->with('user')
            ->latest('id')
            ->paginate(min(50, max(1, $request->integer('per_page', 10))));

        return ReviewResource::collection($reviews);
    }

    /**
     * Review a product.
     *
     * Only customers with a delivered order containing the product can review it, once.
     */
    public function store(ReviewRequest $request, Product $product): ReviewResource
    {
        $user = $request->user();

        $order = Order::query()
            ->where('user_id', $user->id)
            ->where('status', OrderStatus::Delivered->value)
            ->whereHas('items', fn ($q) => $q->where('product_id', $product->id))
            ->latest('id')
            ->first();

        if ($order === null) {
            throw new ApiException('You can review a burger after it has been delivered to you.', 'review_requires_purchase', 403);
        }

        $alreadyReviewed = fn () => new ApiException('You have already reviewed this product.', 'review_exists', 409);
        if ($product->reviews()->where('user_id', $user->id)->exists()) {
            throw $alreadyReviewed();
        }

        $review = new Review($request->validated());
        $review->product()->associate($product);
        $review->user()->associate($user);
        $review->order()->associate($order);

        try {
            // Own transaction (a savepoint when nested) so a concurrent duplicate cannot poison an outer transaction.
            DB::transaction(fn () => $review->save());
        } catch (UniqueConstraintViolationException) {
            throw $alreadyReviewed();
        }

        return new ReviewResource($review->load('user'));
    }

    /** Edit your review. */
    public function update(ReviewRequest $request, Review $review): ReviewResource
    {
        Gate::authorize('update', $review);
        $review->update($request->validated());

        return new ReviewResource($review->load('user'));
    }

    /** Delete your review. */
    public function destroy(Review $review): Response
    {
        Gate::authorize('delete', $review);
        $review->delete();

        return response()->noContent();
    }
}
