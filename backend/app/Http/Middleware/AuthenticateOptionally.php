<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * For endpoints open to guests and customers (the cart). Without a bearer token the
 * request continues as a guest; with one, the token must be valid. An expired token is
 * reported as 401 rather than silently showing a guest cart.
 */
class AuthenticateOptionally
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->bearerToken() !== null) {
            if (! Auth::guard('sanctum')->check()) {
                throw new AuthenticationException('Unauthenticated.', ['sanctum']);
            }
            Auth::shouldUse('sanctum');
        }

        return $next($request);
    }
}
