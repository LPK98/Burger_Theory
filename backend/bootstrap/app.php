<?php

use App\Exceptions\ApiException;
use App\Http\Middleware\AuthenticateOptionally;
use App\Http\Middleware\EnsureUserIsAdmin;
use App\Http\Middleware\ForceJsonResponse;
use App\Http\Middleware\RecordAdminActivity;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->api(prepend: [ForceJsonResponse::class]);
        $middleware->throttleApi('api');

        $middleware->alias([
            'admin' => EnsureUserIsAdmin::class,
            'admin.activity' => RecordAdminActivity::class,
            'auth.optional' => AuthenticateOptionally::class,
        ]);

        // This is a token API; there is no session login page to redirect to.
        $middleware->redirectGuestsTo(fn () => null);

        // PayHere posts form data from its own servers; there is no CSRF token to check (API routes
        // are stateless anyway). Listed explicitly so the intent is clear.
        $middleware->validateCsrfTokens(except: ['api/v1/payments/payhere/notify']);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(fn (Request $request) => $request->is('api/*') || $request->expectsJson());

        // Business-rule failures are expected outcomes, not errors worth logging.
        $exceptions->dontReport([ApiException::class]);

        // Don't reveal model class names or ids in 404s.
        $exceptions->render(function (NotFoundHttpException $e, Request $request) {
            if ($request->is('api/*')) {
                $message = $e->getPrevious() instanceof ModelNotFoundException || $e->getMessage() === ''
                    ? 'Not found.'
                    : $e->getMessage();

                return response()->json(['message' => $message, 'code' => 'not_found'], 404);
            }
        });
    })->create();
