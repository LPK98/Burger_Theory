<?php

namespace App\Http\Middleware;

use App\Services\Admin\ActivityLogger;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

/**
 * Adds every successful admin write (POST, PUT, PATCH, DELETE with a 2xx/3xx answer) to the
 * audit trail. Reads are not logged. A logging failure is reported but never fails the request,
 * because the change it describes has already been committed.
 */
class RecordAdminActivity
{
    public function __construct(private readonly ActivityLogger $logger) {}

    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if (! $request->isMethodSafe() && $response->getStatusCode() < 400) {
            try {
                $this->logger->recordRequest($request, $response);
            } catch (Throwable $e) {
                report($e);
            }
        }

        return $response;
    }
}
