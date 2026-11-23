<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\CategoryRequest;
use App\Http\Resources\CategoryResource;
use App\Models\Category;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

/**
 * @tags Admin · Categories
 */
class CategoryController extends Controller
{
    /** All categories, including inactive ones. */
    public function index(): AnonymousResourceCollection
    {
        return CategoryResource::collection(Category::query()->ordered()->withCount('products')->get());
    }

    public function store(CategoryRequest $request): JsonResponse
    {
        $category = Category::query()->create($request->validated());

        return (new CategoryResource($category))->response()->setStatusCode(201);
    }

    public function update(CategoryRequest $request, Category $category): CategoryResource
    {
        $category->update($request->validated());

        return new CategoryResource($category);
    }

    /** Delete a category (soft delete). Products stay, they just lose this tag. */
    public function destroy(Category $category): Response
    {
        $category->products()->detach();
        $category->delete();

        return response()->noContent();
    }
}
