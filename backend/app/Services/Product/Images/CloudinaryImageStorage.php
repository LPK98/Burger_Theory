<?php

namespace App\Services\Product\Images;

use App\Exceptions\ImageStorageException;
use Cloudinary\Cloudinary;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Log;
use Throwable;

/** Product images on Cloudinary (official cloudinary/cloudinary_php SDK). */
class CloudinaryImageStorage implements ImageStorage
{
    private ?Cloudinary $client = null;

    public function isConfigured(): bool
    {
        return filled(config('services.cloudinary.cloud_name'))
            && filled(config('services.cloudinary.api_key'))
            && filled(config('services.cloudinary.api_secret'));
    }

    public function upload(UploadedFile $file, string $folder): StoredImage
    {
        try {
            $result = $this->client()->uploadApi()->upload($file->getRealPath(), [
                'folder' => $folder,
                'resource_type' => 'image',
                'unique_filename' => true,
                'overwrite' => false,
            ]);
        } catch (Throwable $e) {
            Log::error('Cloudinary upload failed.', ['error' => $e->getMessage()]);
            throw ImageStorageException::uploadFailed();
        }

        return new StoredImage(
            url: (string) $result['secure_url'],
            publicId: (string) $result['public_id'],
            width: isset($result['width']) ? (int) $result['width'] : null,
            height: isset($result['height']) ? (int) $result['height'] : null,
        );
    }

    public function delete(string $publicId): void
    {
        try {
            $this->client()->uploadApi()->destroy($publicId, ['resource_type' => 'image', 'invalidate' => true]);
        } catch (Throwable $e) {
            // The database row is already gone; an orphaned remote file is harmless and logged for cleanup.
            Log::warning('Cloudinary delete failed.', ['public_id' => $publicId, 'error' => $e->getMessage()]);
        }
    }

    private function client(): Cloudinary
    {
        if (! $this->isConfigured()) {
            throw ImageStorageException::notConfigured();
        }

        return $this->client ??= new Cloudinary([
            'cloud' => [
                'cloud_name' => config('services.cloudinary.cloud_name'),
                'api_key' => config('services.cloudinary.api_key'),
                'api_secret' => config('services.cloudinary.api_secret'),
            ],
            'url' => ['secure' => true],
        ]);
    }
}
