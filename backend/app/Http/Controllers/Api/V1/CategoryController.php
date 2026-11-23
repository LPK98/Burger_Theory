<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\CategoryResource;
use App\Models\Category;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * @tags Menu
 */
class CategoryController extends Controller
{
    /**
     * List menu categories.
     *
     * `products_count` counts products currently on the menu.
     *
     * @unauthenticated
     */
    public function index(): AnonymousResourceCollection
    {
        $categories = Category::query()
            ->active()
            ->ordered()
            ->withCount(['products' => fn ($q) => $q->where('is_available', true)])
            ->get();

        return CategoryResource::collection($categories);
    }

    /**
     * Show a category by id or slug.
     *
     * @unauthenticated
     */
    public function show(Category $category): CategoryResource
    {
        abort_unless($category->is_active, 404);

        return new CategoryResource($category->loadCount(['products' => fn ($q) => $q->where('is_available', true)]));
    }
}
