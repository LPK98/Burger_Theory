<?php

namespace App\Enums;

enum InventoryReason: string
{
    /** Stock taken by a placed order. */
    case Sale = 'sale';
    /** Stock returned because an order was cancelled, rejected or expired. */
    case OrderRelease = 'order_release';
    /** New stock received. */
    case Restock = 'restock';
    /** Manual correction (stock count, waste…). */
    case Adjustment = 'adjustment';
}
