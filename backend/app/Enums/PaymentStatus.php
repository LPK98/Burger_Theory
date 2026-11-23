<?php

namespace App\Enums;

enum PaymentStatus: string
{
    /** Awaiting payment (PayHere checkout not finished, or cash not yet collected). */
    case Pending = 'pending';
    /** Verified by a signed PayHere notification, or cash collected and recorded by an admin. */
    case Paid = 'paid';
    case Failed = 'failed';
    case Cancelled = 'cancelled';
    /** PayHere reported a chargeback after the payment had succeeded. */
    case ChargedBack = 'charged_back';
    /** Money arrived for an order that was already paid or no longer active; refund it manually. */
    case RefundRequired = 'refund_required';

    /** A new PayHere attempt may be started after these. */
    public function allowsRetry(): bool
    {
        return in_array($this, [self::Failed, self::Cancelled], true);
    }
}
