<?php

namespace App\Policies;

use App\Models\Address;
use App\Models\User;
use Illuminate\Auth\Access\Response;

class AddressPolicy
{
    public function view(User $user, Address $address): Response
    {
        return $this->owns($user, $address);
    }

    public function update(User $user, Address $address): Response
    {
        return $this->owns($user, $address);
    }

    public function delete(User $user, Address $address): Response
    {
        return $this->owns($user, $address);
    }

    private function owns(User $user, Address $address): Response
    {
        return $address->user_id === $user->id ? Response::allow() : Response::denyAsNotFound();
    }
}
