<?php

namespace App\Enums;

/**
 * Order lifecycle:
 *
 *   pending → confirmed → preparing → ready → out_for_delivery → delivered   (delivery)
 *   pending → confirmed → preparing → ready → delivered                      (pickup: "delivered" = collected)
 *
 * pending can be rejected by the restaurant; any non-final state can be cancelled.
 */
enum OrderStatus: string
{
    case Pending = 'pending';
    case Confirmed = 'confirmed';
    case Preparing = 'preparing';
    case Ready = 'ready';
    case OutForDelivery = 'out_for_delivery';
    case Delivered = 'delivered';
    case Cancelled = 'cancelled';
    case Rejected = 'rejected';

    public function label(): string
    {
        return match ($this) {
            self::Pending => 'Pending',
            self::Confirmed => 'Confirmed',
            self::Preparing => 'Preparing',
            self::Ready => 'Ready',
            self::OutForDelivery => 'Out for delivery',
            self::Delivered => 'Delivered',
            self::Cancelled => 'Cancelled',
            self::Rejected => 'Rejected',
        };
    }

    /** @return list<self> */
    public function nextStatuses(FulfilmentType $fulfilment): array
    {
        return match ($this) {
            self::Pending => [self::Confirmed, self::Rejected, self::Cancelled],
            self::Confirmed => [self::Preparing, self::Cancelled],
            self::Preparing => [self::Ready, self::Cancelled],
            self::Ready => $fulfilment === FulfilmentType::Delivery
                ? [self::OutForDelivery, self::Cancelled]
                : [self::Delivered, self::Cancelled],
            self::OutForDelivery => [self::Delivered, self::Cancelled],
            self::Delivered, self::Cancelled, self::Rejected => [],
        };
    }

    public function canTransitionTo(self $next, FulfilmentType $fulfilment): bool
    {
        return in_array($next, $this->nextStatuses($fulfilment), true);
    }

    public function isFinal(): bool
    {
        return in_array($this, [self::Delivered, self::Cancelled, self::Rejected], true);
    }

    /** Cancelled or rejected: stock and coupon usage are released. */
    public function isVoid(): bool
    {
        return in_array($this, [self::Cancelled, self::Rejected], true);
    }

    /** A customer may only cancel before the kitchen has accepted the order. */
    public function isCancellableByCustomer(): bool
    {
        return $this === self::Pending;
    }

    /** States in which cash can have changed hands. */
    public function allowsCashCollection(): bool
    {
        return in_array($this, [self::Ready, self::OutForDelivery, self::Delivered], true);
    }

    /** @return list<string> */
    public static function voidValues(): array
    {
        return [self::Cancelled->value, self::Rejected->value];
    }
}
