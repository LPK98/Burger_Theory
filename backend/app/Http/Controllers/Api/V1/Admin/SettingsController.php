<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Exceptions\ImageStorageException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\UpdateSettingsRequest;
use App\Services\Payment\PayHere\PayHereConfig;
use App\Services\Payment\Stripe\StripeConfig;
use App\Services\Product\Images\ImageStorage;
use App\Services\Settings\RestaurantSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * @tags Admin · Settings
 */
class SettingsController extends Controller
{
    public function __construct(
        private readonly RestaurantSettings $settings,
        private readonly ImageStorage $images,
        private readonly PayHereConfig $payHere,
        private readonly StripeConfig $stripe,
    ) {}

    /**
     * All settings: ordering rules (money in cents) and the restaurant profile.
     *
     * `meta.integrations` says which external services are configured on the server.
     */
    public function show(): JsonResponse
    {
        return $this->respond();
    }

    /** Update any subset of the settings. */
    public function update(UpdateSettingsRequest $request): JsonResponse
    {
        $this->settings->update($request->validated(), $request->user());

        return $this->respond();
    }

    /**
     * Upload the restaurant logo to Cloudinary (multipart, field `logo`).
     *
     * JPG, PNG or WebP up to 2 MB. Replaces (and deletes) the previous logo.
     */
    public function uploadLogo(Request $request): JsonResponse
    {
        $request->validate([
            'logo' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048', 'dimensions:min_width=64,min_height=64,max_width=4000,max_height=4000'],
        ]);
        if (! $this->images->isConfigured()) {
            throw ImageStorageException::notConfigured();
        }

        $previous = $this->settings->all()['logo_public_id'];
        $stored = $this->images->upload($request->file('logo'), (string) config('services.cloudinary.branding_folder'));
        $this->settings->update(['logo_url' => $stored->url, 'logo_public_id' => $stored->publicId], $request->user());

        if ($previous !== null && $previous !== $stored->publicId) {
            $this->images->delete($previous);
        }

        return $this->respond();
    }

    /** Remove the restaurant logo. */
    public function deleteLogo(Request $request): JsonResponse
    {
        $previous = $this->settings->all()['logo_public_id'];
        $this->settings->update(['logo_url' => null, 'logo_public_id' => null], $request->user());
        if ($previous !== null) {
            $this->images->delete($previous);
        }

        return $this->respond();
    }

    private function respond(): JsonResponse
    {
        $values = $this->settings->all();
        unset($values['logo_public_id']);
        foreach (RestaurantSettings::HOURS_KEYS as $key) {
            unset($values[$key]);
        }

        return response()->json([
            'data' => $values,
            'meta' => ['integrations' => [
                'cloudinary' => $this->images->isConfigured(),
                'payhere' => $this->payHere->isConfigured(),
                'payhere_sandbox' => $this->payHere->isSandbox(),
                'stripe' => $this->stripe->isConfigured(),
                'stripe_webhook' => $this->stripe->webhookConfigured(),
                'stripe_test_mode' => $this->stripe->isTestMode(),
                'currency' => (string) config('restaurant.currency'),
                'timezone' => (string) config('restaurant.timezone'),
            ]],
        ]);
    }
}
