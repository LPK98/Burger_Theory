<?php

namespace App\Services\Product;

use App\Exceptions\ImageStorageException;
use App\Models\Product;
use App\Models\ProductImage;
use App\Services\Product\Images\ImageStorage;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Throwable;

class ProductImageService
{
    public function __construct(private readonly ImageStorage $storage) {}

    public function upload(Product $product, UploadedFile $file, ?string $altText, bool $makePrimary): ProductImage
    {
        if (! $this->storage->isConfigured()) {
            throw ImageStorageException::notConfigured();
        }

        $stored = $this->storage->upload($file, (string) config('services.cloudinary.folder'));

        try {
            return DB::transaction(function () use ($product, $stored, $altText, $makePrimary) {
                $hasPrimary = $product->images()->where('is_primary', true)->exists();
                $primary = $makePrimary || ! $hasPrimary;
                if ($primary && $hasPrimary) {
                    $product->images()->update(['is_primary' => false]);
                }

                return $product->images()->create([
                    'url' => $stored->url,
                    'public_id' => $stored->publicId,
                    'alt_text' => $altText ?? $product->name,
                    'width' => $stored->width,
                    'height' => $stored->height,
                    'is_primary' => $primary,
                    'sort_order' => (int) $product->images()->max('sort_order') + 1,
                ]);
            });
        } catch (Throwable $e) {
            // Do not leave an orphaned upload behind if the database write failed.
            $this->storage->delete($stored->publicId);
            throw $e;
        }
    }

    /** @param array{alt_text?: ?string, is_primary?: bool, sort_order?: int} $data */
    public function update(ProductImage $image, array $data): ProductImage
    {
        return DB::transaction(function () use ($image, $data) {
            if (($data['is_primary'] ?? false) === true) {
                ProductImage::query()->where('product_id', $image->product_id)->whereKeyNot($image->id)->update(['is_primary' => false]);
            }
            $image->update($data);

            return $image;
        });
    }

    public function delete(ProductImage $image): void
    {
        DB::transaction(function () use ($image) {
            $wasPrimary = $image->is_primary;
            $image->delete();

            if ($wasPrimary) {
                ProductImage::query()->where('product_id', $image->product_id)
                    ->orderBy('sort_order')->orderBy('id')->first()?->update(['is_primary' => true]);
            }
        });

        if ($image->public_id !== null) {
            $this->storage->delete($image->public_id);
        }
    }
}
