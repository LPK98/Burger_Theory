<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\ProductImageRequest;
use App\Http\Resources\ProductImageResource;
use App\Models\Product;
use App\Models\ProductImage;
use App\Services\Product\ProductImageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

/**
 * @tags Admin · Products
 */
class ProductImageController extends Controller
{
    public function __construct(private readonly ProductImageService $images) {}

    /**
     * Upload a product image to Cloudinary (multipart/form-data, field `image`).
     *
     * JPG, PNG or WebP up to 5 MB. The first image becomes the primary one.
     */
    public function store(ProductImageRequest $request, Product $product): JsonResponse
    {
        $image = $this->images->upload(
            $product,
            $request->file('image'),
            $request->validated('alt_text'),
            $request->boolean('is_primary'),
        );

        return (new ProductImageResource($image))->response()->setStatusCode(201);
    }

    /** Change alt text or order, or make an image the primary one. */
    public function update(ProductImageRequest $request, Product $product, ProductImage $image): ProductImageResource
    {
        $data = $request->validated();
        if (array_key_exists('is_primary', $data)) {
            $data['is_primary'] = true;
        }

        return new ProductImageResource($this->images->update($image, $data));
    }

    /** Delete an image (also removed from Cloudinary). */
    public function destroy(Product $product, ProductImage $image): Response
    {
        $this->images->delete($image);

        return response()->noContent();
    }
}
