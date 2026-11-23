<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\ProductAddonsRequest;
use App\Http\Resources\AdminProductResource;
use App\Models\Product;

/**
 * @tags Admin · Products
 */
class ProductAddonController extends Controller
{
    /**
     * Replace the add-ons a product offers.
     *
     * Send the full list; add-ons left out are removed from the product. Cart lines that use a
     * removed add-on are flagged (`addon_unavailable`) until the customer re-adds the burger.
     */
    public function update(ProductAddonsRequest $request, Product $product): AdminProductResource
    {
        $product->addons()->sync($request->pivot());

        return new AdminProductResource($product->load(['images', 'categories', 'ingredients', 'addons']));
    }
}
