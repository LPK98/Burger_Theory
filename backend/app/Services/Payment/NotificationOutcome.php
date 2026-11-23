<?php

namespace App\Services\Payment;

enum NotificationOutcome: string
{
    /** Verified and applied. */
    case Processed = 'processed';
    /** Verified, but already applied earlier (the gateway retried). */
    case Duplicate = 'duplicate';
    /** Verified, but would move the payment backwards (e.g. "pending" after "paid"). */
    case Ignored = 'ignored';
    /** Failed verification; nothing changed. */
    case Rejected = 'rejected';
}
