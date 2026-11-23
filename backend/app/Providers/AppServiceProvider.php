<?php

namespace App\Providers;

use App\Models\User;
use App\Services\Payment\PayHere\PayHereConfig;
use App\Services\Product\Images\CloudinaryImageStorage;
use App\Services\Product\Images\ImageStorage;
use App\Services\Settings\RestaurantSettings;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;
use Laravel\Sanctum\PersonalAccessToken;
use Laravel\Sanctum\Sanctum;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->scoped(RestaurantSettings::class);
        $this->app->singleton(PayHereConfig::class);
        $this->app->singleton(ImageStorage::class, CloudinaryImageStorage::class);
    }

    public function boot(): void
    {
        // Catch attributes that are silently dropped by $fillable during development and tests.
        Model::preventSilentlyDiscardingAttributes(! $this->app->isProduction());

        Password::defaults(fn () => $this->app->isProduction()
            ? Password::min(10)->letters()->numbers()->uncompromised()
            : Password::min(8)->letters()->numbers());

        $this->configureRateLimiting();

        // Suspending an account revokes its tokens; this also rejects any token a suspended
        // account still holds (e.g. if suspended_at was set directly in the database).
        Sanctum::authenticateAccessTokensUsing(
            fn (PersonalAccessToken $token, bool $isValid) => $isValid && ! ($token->tokenable instanceof User && $token->tokenable->isSuspended())
        );
    }

    private function configureRateLimiting(): void
    {
        RateLimiter::for('api', fn (Request $request) => Limit::perMinute(120)->by($request->user()?->id ?: $request->ip()));

        // Brute-force protection: per account+IP, plus an overall per-IP ceiling.
        RateLimiter::for('auth', fn (Request $request) => [
            Limit::perMinute(5)->by('auth:'.mb_strtolower((string) $request->input('email')).'|'.$request->ip()),
            Limit::perMinute(20)->by('auth-ip:'.$request->ip()),
        ]);

        RateLimiter::for('orders', fn (Request $request) => Limit::perMinute(10)->by('orders:'.($request->user()?->id ?: $request->ip())));

        RateLimiter::for('payhere-notify', fn (Request $request) => Limit::perMinute(120)->by('payhere:'.$request->ip()));
    }
}
