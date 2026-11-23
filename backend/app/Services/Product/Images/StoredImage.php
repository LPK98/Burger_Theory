<?php

namespace App\Services\Product\Images;

final readonly class StoredImage
{
    public function __construct(
        public string $url,
        public string $publicId,
        public ?int $width = null,
        public ?int $height = null,
    ) {}
}
