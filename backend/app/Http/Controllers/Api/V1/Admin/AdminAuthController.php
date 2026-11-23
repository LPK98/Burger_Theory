<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\Admin\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * @tags Admin · Authentication
 */
class AdminAuthController extends Controller
{
    /**
     * Log in to the admin portal.
     *
     * Issues a token only to administrators. A wrong password and a customer account get the
     * same answer, so the endpoint never reveals which emails belong to customers. There is
     * no admin registration endpoint: administrators are created with `php artisan app:create-admin`.
     *
     * @unauthenticated
     */
    public function login(LoginRequest $request, ActivityLogger $activity): JsonResponse
    {
        $user = User::query()->where('email', $request->validated('email'))->first();

        // Hash::check runs even for unknown emails so response times don't reveal which accounts exist.
        $passwordOk = Hash::check($request->validated('password'), $user?->password ?? '$2y$12$'.str_repeat('a', 53));

        if ($user === null || ! $passwordOk || ! $user->isAdmin()) {
            throw ValidationException::withMessages(['email' => 'These credentials don’t match an administrator account.']);
        }

        if ($user->isSuspended()) {
            throw ValidationException::withMessages(['email' => 'This administrator account has been suspended.']);
        }

        $token = $user->createToken($request->input('device_name') ?: 'admin-portal');
        $activity->recordEvent($user, 'admin.login', $request);

        return response()->json([
            'data' => [
                'user' => new UserResource($user),
                'token' => $token->plainTextToken,
                'token_type' => 'Bearer',
                'expires_at' => $token->accessToken->expires_at?->toIso8601String(),
            ],
        ]);
    }
}
