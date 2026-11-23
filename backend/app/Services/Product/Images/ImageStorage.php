<?php

namespace App\Services\Product\Images;

use Illuminate\Http\UploadedFile;

interface ImageStorage
{
    public function isConfigured(): bool;

    public function upload(UploadedFile $file, string $folder): StoredImage;

    public function delete(string $publicId): void;
}
