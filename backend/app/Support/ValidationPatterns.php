<?php

namespace App\Support;

final class ValidationPatterns
{
    /** Local (07X XXX XXXX) or international (+94 7X XXX XXXX) numbers; spaces, dashes and brackets allowed. */
    public const PHONE = '/^\+?[0-9][0-9\s\-()]{6,18}$/';

    /** lower-case-words-with-dashes, never purely numeric (ids and slugs share route parameters). */
    public const SLUG = '/^(?!\d+$)[a-z0-9]+(?:-[a-z0-9]+)*$/';
}
