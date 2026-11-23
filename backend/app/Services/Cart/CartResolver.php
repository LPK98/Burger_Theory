<?php

namespace App\Services\Cart;

use App\Models\Cart;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Finds the cart for the current request.
 *
 * - Signed-in customers (Bearer token) have exactly one cart, tied to their account.
 * - Guests send the token returned by the API in the X-Cart-Token header. A guest token
 *   can never open a customer's cart.
 */
class CartResolver
{
    public const HEADER = 'X-Cart-Token';

    public function find(Request $request): ?Cart
    {
        if ($user = $request->user()) {
            return Cart::query()->where('user_id', $user->id)->first();
        }

        $token = $this->guestToken($request);

        return $token === null ? null : $this->findGuestCart($token);
    }

    public function findOrCreate(Request $request): Cart
    {
        if ($cart = $this->find($request)) {
            return $cart;
        }

        if ($user = $request->user()) {
            return Cart::query()->createOrFirst(['user_id' => $user->id], ['token' => (string) Str::uuid()]);
        }

        return Cart::query()->create(['token' => (string) Str::uuid()]);
    }

    public function findGuestCart(string $token): ?Cart
    {
        if (! Str::isUuid($token)) {
            return null;
        }

        return Cart::query()
            ->whereNull('user_id')
            ->where('token', $token)
            ->where('updated_at', '>=', now()->subDays((int) config('restaurant.cart.guest_ttl_days')))
            ->first();
    }

    private function guestToken(Request $request): ?string
    {
        $token = $request->header(self::HEADER);

        return is_string($token) && Str::isUuid($token) ? $token : null;
    }
}
