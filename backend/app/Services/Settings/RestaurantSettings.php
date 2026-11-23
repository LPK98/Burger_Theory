<?php

namespace App\Services\Settings;

use App\Enums\FulfilmentType;
use App\Enums\PaymentMethod;
use App\Models\RestaurantSetting;
use App\Models\User;
use App\Services\Hours\OpeningHoursService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Typed access to runtime-editable restaurant settings. Unknown keys are ignored, and
 * missing keys fall back to config('restaurant.defaults').
 */
class RestaurantSettings
{
    private const CACHE_KEY = 'restaurant_settings:v1';

    public const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    /** Setting key => value type. */
    public const SCHEMA = [
        // Ordering
        'accepting_orders' => 'bool',
        'delivery_enabled' => 'bool',
        'pickup_enabled' => 'bool',
        'cod_enabled' => 'bool',
        'payhere_enabled' => 'bool',
        'delivery_fee' => 'money',
        'free_delivery_threshold' => 'nullable_money',
        'minimum_order_amount' => 'money',
        'estimated_preparation_minutes' => 'int',
        // Restaurant profile
        'restaurant_name' => 'string',
        'contact_phone' => 'nullable_string',
        'contact_email' => 'nullable_string',
        'address_line1' => 'nullable_string',
        'address_line2' => 'nullable_string',
        'city' => 'nullable_string',
        'postal_code' => 'nullable_string',
        'instagram_url' => 'nullable_string',
        'facebook_url' => 'nullable_string',
        // Opening hours (the weekly hours and special dates have their own tables; see
        // App\Services\Hours\OpeningHoursService). Written only through /admin/opening-hours.
        'temporarily_closed' => 'bool',
        'hours_announcement' => 'nullable_string',
        // Set only through the logo upload endpoint.
        'logo_url' => 'nullable_string',
        'logo_public_id' => 'nullable_string',
    ];

    /** Keys the logo endpoint owns; the general settings update never writes them. */
    public const LOGO_KEYS = ['logo_url', 'logo_public_id'];

    /** Keys the opening-hours endpoint owns; the general settings endpoint neither shows nor writes them. */
    public const HOURS_KEYS = ['temporarily_closed', 'hours_announcement'];

    /** @var array<string, mixed>|null */
    private ?array $resolved = null;

    /** @return array<string, mixed> */
    public function all(): array
    {
        if ($this->resolved !== null) {
            return $this->resolved;
        }

        $stored = Cache::rememberForever(self::CACHE_KEY, fn () => RestaurantSetting::query()
            ->whereIn('key', array_keys(self::SCHEMA))
            ->pluck('value', 'key')
            ->all());

        $values = [];
        foreach (self::SCHEMA as $key => $type) {
            $raw = array_key_exists($key, $stored) ? $stored[$key] : config("restaurant.defaults.{$key}");
            $values[$key] = $this->cast($type, $raw);
        }

        return $this->resolved = $values;
    }

    /**
     * @param  array<string, mixed>  $values  Already validated.
     * @return array<string, mixed>
     */
    public function update(array $values, ?User $by = null): array
    {
        DB::transaction(function () use ($values, $by) {
            foreach (array_intersect_key($values, self::SCHEMA) as $key => $value) {
                RestaurantSetting::query()->updateOrCreate(
                    ['key' => $key],
                    ['value' => $this->cast(self::SCHEMA[$key], $value), 'updated_by_id' => $by?->id],
                );
            }
        });

        Cache::forget(self::CACHE_KEY);
        $this->resolved = null;

        return $this->all();
    }

    /** The public restaurant profile: name, contact, address, hours, social links, logo. */
    public function profile(): array
    {
        $s = $this->all();

        return [
            'name' => $s['restaurant_name'],
            'phone' => $s['contact_phone'],
            'email' => $s['contact_email'],
            'address' => [
                'line1' => $s['address_line1'],
                'line2' => $s['address_line2'],
                'city' => $s['city'],
                'postal_code' => $s['postal_code'],
            ],
            'opening_hours' => array_map(
                fn (array $h) => ['day' => $h['day'], 'closed' => $h['closed'], 'open' => $h['open'], 'close' => $h['close']],
                app(OpeningHoursService::class)->weekly(),
            ),
            'social' => [
                'instagram' => $s['instagram_url'],
                'facebook' => $s['facebook_url'],
            ],
            'logo_url' => $s['logo_url'],
        ];
    }

    public function acceptingOrders(): bool
    {
        return $this->all()['accepting_orders'];
    }

    public function fulfilmentEnabled(FulfilmentType $type): bool
    {
        return $this->all()[$type === FulfilmentType::Delivery ? 'delivery_enabled' : 'pickup_enabled'];
    }

    public function paymentMethodEnabled(PaymentMethod $method): bool
    {
        return $this->all()[$method === PaymentMethod::PayHere ? 'payhere_enabled' : 'cod_enabled'];
    }

    public function deliveryFee(): int
    {
        return $this->all()['delivery_fee'];
    }

    public function freeDeliveryThreshold(): ?int
    {
        return $this->all()['free_delivery_threshold'];
    }

    public function minimumOrderAmount(): int
    {
        return $this->all()['minimum_order_amount'];
    }

    public function preparationMinutes(): int
    {
        return $this->all()['estimated_preparation_minutes'];
    }

    private function cast(string $type, mixed $value): mixed
    {
        return match ($type) {
            'bool' => (bool) $value,
            'int', 'money' => (int) $value,
            'nullable_money' => $value === null ? null : (int) $value,
            'string' => trim((string) $value),
            'nullable_string' => $value === null || trim((string) $value) === '' ? null : trim((string) $value),
        };
    }
}
