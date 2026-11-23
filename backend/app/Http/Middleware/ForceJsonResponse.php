<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** API errors are always JSON, even if a client forgets the Accept header. Adds conservative security headers. */
class ForceJsonResponse
{
    public function handle(Request $request, Closure $next): Response
    {
        $request->headers->set('Accept', 'application/json');

        $response = $next($request);

        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        // Personal data (signed-in or cart responses) must never be stored by shared caches.
        if ($request->bearerToken() !== null || $request->headers->has('X-Cart-Token') || $request->is('api/*/cart*')) {
            $response->headers->set('Cache-Control', 'no-store, private');
        }

        return $response;
    }
}
