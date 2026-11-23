<?php

namespace Tests\Fakes;

use App\Services\Product\Images\ImageStorage;
use App\Services\Product\Images\StoredImage;
use Illuminate\Http\UploadedFile;

/** In-memory stand-in for Cloudinary. */
class FakeImageStorage implements ImageStorage
{
    /** @var array<string, string> public_id => original filename */
    public array $stored = [];

    /** @var list<string> */
    public array $deleted = [];

    public function __construct(private readonly bool $configured = true) {}

    public function isConfigured(): bool
    {
        return $this->configured;
    }

    public function upload(UploadedFile $file, string $folder): StoredImage
    {
        $publicId = $folder.'/'.pathinfo($file->hashName(), PATHINFO_FILENAME);
        $this->stored[$publicId] = $file->getClientOriginalName();

        return new StoredImage("https://res.cloudinary.com/demo/image/upload/{$publicId}.jpg", $publicId, 800, 800);
    }

    public function delete(string $publicId): void
    {
        $this->deleted[] = $publicId;
        unset($this->stored[$publicId]);
    }
}
