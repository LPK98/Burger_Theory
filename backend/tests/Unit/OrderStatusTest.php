<?php

namespace Tests\Unit;

use App\Enums\FulfilmentType;
use App\Enums\OrderStatus;
use PHPUnit\Framework\TestCase;

class OrderStatusTest extends TestCase
{
    public function test_delivery_orders_follow_the_full_workflow(): void
    {
        $path = [OrderStatus::Pending, OrderStatus::Confirmed, OrderStatus::Preparing, OrderStatus::Ready, OrderStatus::OutForDelivery, OrderStatus::Delivered];

        for ($i = 0; $i < count($path) - 1; $i++) {
            $this->assertTrue($path[$i]->canTransitionTo($path[$i + 1], FulfilmentType::Delivery), "{$path[$i]->value} → {$path[$i + 1]->value}");
        }
    }

    public function test_pickup_orders_skip_out_for_delivery(): void
    {
        $this->assertTrue(OrderStatus::Ready->canTransitionTo(OrderStatus::Delivered, FulfilmentType::Pickup));
        $this->assertFalse(OrderStatus::Ready->canTransitionTo(OrderStatus::OutForDelivery, FulfilmentType::Pickup));
        $this->assertFalse(OrderStatus::Ready->canTransitionTo(OrderStatus::Delivered, FulfilmentType::Delivery));
    }

    public function test_steps_cannot_be_skipped_or_reversed(): void
    {
        $this->assertFalse(OrderStatus::Pending->canTransitionTo(OrderStatus::Preparing, FulfilmentType::Delivery));
        $this->assertFalse(OrderStatus::Preparing->canTransitionTo(OrderStatus::Confirmed, FulfilmentType::Delivery));
        $this->assertFalse(OrderStatus::Confirmed->canTransitionTo(OrderStatus::Rejected, FulfilmentType::Delivery));
    }

    public function test_final_states_are_final(): void
    {
        foreach ([OrderStatus::Delivered, OrderStatus::Cancelled, OrderStatus::Rejected] as $final) {
            $this->assertTrue($final->isFinal());
            $this->assertSame([], $final->nextStatuses(FulfilmentType::Delivery));
        }
    }

    public function test_only_pending_orders_are_customer_cancellable(): void
    {
        $this->assertTrue(OrderStatus::Pending->isCancellableByCustomer());
        foreach (OrderStatus::cases() as $status) {
            if ($status !== OrderStatus::Pending) {
                $this->assertFalse($status->isCancellableByCustomer(), $status->value);
            }
        }
    }
}
