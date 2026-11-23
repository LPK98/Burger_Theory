<?php

namespace App\Exceptions;

class ImageStorageException extends ApiException
{
    public static function notConfigured(): self
    {
        return new self('Image uploads are not configured (set the CLOUDINARY_* variables).', 'image_storage_not_configured', 503);
    }

    public static function uploadFailed(): self
    {
        return new self('The image could not be uploaded. Please try again.', 'image_upload_failed', 502);
    }
}
