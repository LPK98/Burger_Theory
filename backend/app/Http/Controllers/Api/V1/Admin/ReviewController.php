<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\ModerateReviewRequest;
use App\Http\Resources\ReviewResource;
use App\Models\Review;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

/**
 * @tags Admin · Reviews
 */
class ReviewController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $reviews = Review::query()
            ->with('user')
            ->when($request->filled('product_id'), fn ($q) => $q->where('product_id', $request->integer('product_id')))
            ->when($request->has('is_published'), fn ($q) => $q->where('is_published', $request->boolean('is_published')))
            ->latest('id')
            ->paginate(min(100, max(1, $request->integer('per_page', 25))));

        return ReviewResource::collection($reviews);
    }

    /** Publish or hide a review. */
    public function update(ModerateReviewRequest $request, Review $review): ReviewResource
    {
        $review->forceFill(['is_published' => $request->boolean('is_published')])->save();

        return new ReviewResource($review->load('user'));
    }

    public function destroy(Review $review): Response
    {
        $review->delete();

        return response()->noContent();
    }
}
