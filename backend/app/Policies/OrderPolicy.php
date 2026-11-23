<?php

namespace App\Policies;

use App\Models\Order;
use App\Models\User;
use Illuminate\Auth\Access\Response;

/** Other customers' orders answer 404, not 403, so order numbers cannot be probed. */
class OrderPolicy
{
    public function view(User $user, Order $order): Response
    {
        return $user->isAdmin() || $order->user_id === $user->id
            ? Response::allow()
            : Response::denyAsNotFound();
    }

    public function cancel(User $user, Order $order): Response
    {
        return $order->user_id === $user->id ? Response::allow() : Response::denyAsNotFound();
    }

    public function pay(User $user, Order $order): Response
    {
        return $order->user_id === $user->id ? Response::allow() : Response::denyAsNotFound();
    }
}
