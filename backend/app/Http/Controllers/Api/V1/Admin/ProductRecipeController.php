<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\ProductRecipeRequest;
use App\Http\Resources\AdminProductResource;
use App\Models\Product;
use App\Services\Inventory\IngredientService;

/**
 * @tags Admin · Products
 */
class ProductRecipeController extends Controller
{
    /**
     * Replace a product's recipe.
     *
     * Each placed order then consumes `quantity` of every listed ingredient per unit sold,
     * and returns it if the order is cancelled or rejected.
     */
    public function update(ProductRecipeRequest $request, Product $product, IngredientService $ingredients): AdminProductResource
    {
        $ingredients->syncRecipe($product, $request->validated('items'));

        return new AdminProductResource($product->load(['images', 'categories', 'ingredients']));
    }
}
