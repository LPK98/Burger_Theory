<?php

namespace Tests\Feature\Admin;

use App\Enums\OrderStatus;
use App\Models\Order;
use App\Services\Product\Images\ImageStorage;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\Fakes\FakeImageStorage;
use Tests\TestCase;

class ReportsAndSettingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_weekly_sales_start_on_monday_in_the_restaurant_timezone(): void
    {
        $tz = 'Asia/Colombo';
        // Sunday 15 Nov 23:30 local (18:00 UTC) belongs to the week of Monday 9 Nov.
        Order::factory()->paid(CarbonImmutable::parse('2026-11-15 23:30', $tz)->utc())->total(100000)
            ->create(['created_at' => CarbonImmutable::parse('2026-11-15 23:00', $tz)->utc()]);
        // Monday 16 Nov 00:30 local (still Sunday in UTC) starts the next week.
        Order::factory()->paid(CarbonImmutable::parse('2026-11-16 00:30', $tz)->utc())->total(250000)
            ->create(['created_at' => CarbonImmutable::parse('2026-11-16 00:10', $tz)->utc()]);
        Order::factory()->status(OrderStatus::Cancelled)->total(90000)
            ->create(['created_at' => CarbonImmutable::parse('2026-11-18 12:00', $tz)->utc()]);

        // Wednesday 4 Nov to Friday 20 Nov widens to whole weeks: Monday 2 Nov to Sunday 22 Nov.
        $response = $this->getJson('/api/v1/admin/reports/sales?interval=week&from=2026-11-04&to=2026-11-20', $this->bearer($this->admin()))
            ->assertOk()
            ->assertJsonPath('data.from', '2026-11-02')
            ->assertJsonPath('data.to', '2026-11-22');

        $series = $response->json('data.series');
        $this->assertSame(['2026-11-02', '2026-11-09', '2026-11-16'], array_column($series, 'period'));
        $this->assertSame([0, 100000, 250000], array_column($series, 'revenue'));
        $this->assertSame([0, 1, 2], array_column($series, 'placed'));
        $this->assertSame([0, 0, 1], array_column($series, 'cancelled'));
    }

    public function test_order_statistics(): void
    {
        $tz = 'Asia/Colombo';
        $at = fn (string $local) => ['created_at' => CarbonImmutable::parse($local, $tz)->utc()];
        Order::factory()->paid()->status(OrderStatus::Delivered)->total(300000)->create($at('2026-11-20 12:15'));
        Order::factory()->payhere()->paid()->status(OrderStatus::Delivered)->total(100000)->create($at('2026-11-20 12:45') + ['fulfilment_type' => 'delivery', 'subtotal' => 65000, 'delivery_fee' => 35000, 'delivery_line1' => '12 Galle Road', 'delivery_city' => 'Colombo 03']);
        Order::factory()->status(OrderStatus::Rejected)->total(50000)->create($at('2026-11-21 19:05'));
        Order::factory()->total(70000)->create($at('2026-11-25 10:00')); // outside the range

        $this->getJson('/api/v1/admin/reports/orders?from=2026-11-20&to=2026-11-21', $this->bearer($this->admin()))
            ->assertOk()
            ->assertJsonPath('data.orders_placed', 3)
            ->assertJsonPath('data.paid_orders', 2)
            ->assertJsonPath('data.revenue', 400000)
            ->assertJsonPath('data.average_order_value', 200000)
            ->assertJsonPath('data.cancelled_orders', 1)
            ->assertJsonPath('data.cancellation_rate', 0.3333)
            ->assertJsonPath('data.by_status.delivered', 2)
            ->assertJsonPath('data.by_payment_method.payhere', 1)
            ->assertJsonPath('data.by_fulfilment.delivery', 1)
            ->assertJsonPath('data.by_hour.12.orders', 2)
            ->assertJsonPath('data.by_hour.19.orders', 1);
    }

    public function test_restaurant_profile_settings_are_saved_validated_and_public(): void
    {
        $headers = $this->bearer($this->admin());
        $this->patchJson('/api/v1/admin/settings', [
            'restaurant_name' => 'Burger Theory Colombo',
            'contact_phone' => '+94 77 123 4567',
            'contact_email' => 'hello@burgertheory.example',
            'address_line1' => '42 Galle Road',
            'city' => 'Colombo 03',
            'instagram_url' => 'https://www.instagram.com/burgertheory',
            // Opening hours moved to /admin/opening-hours; the settings endpoint ignores them.
            'opening_hours' => [['day' => 'monday', 'closed' => true]],
            'temporarily_closed' => true,
            'delivery_fee' => 40000,
            'logo_url' => 'https://evil.example/logo.png',
        ], $headers)
            ->assertOk()
            ->assertJsonPath('data.restaurant_name', 'Burger Theory Colombo')
            ->assertJsonMissingPath('data.opening_hours')
            ->assertJsonMissingPath('data.temporarily_closed')
            ->assertJsonMissingPath('data.hours_announcement')
            ->assertJsonPath('data.delivery_fee', 40000)
            ->assertJsonPath('data.logo_url', null)
            ->assertJsonMissingPath('data.logo_public_id')
            ->assertJsonPath('meta.integrations.cloudinary', false);

        $this->getJson('/api/v1/restaurant')
            ->assertJsonPath('data.name', 'Burger Theory Colombo')
            ->assertJsonPath('data.profile.phone', '+94 77 123 4567')
            ->assertJsonPath('data.profile.address.line1', '42 Galle Road')
            ->assertJsonPath('data.profile.social', ['instagram' => 'https://www.instagram.com/burgertheory', 'facebook' => null])
            ->assertJsonPath('data.profile.maps_url', 'https://www.google.com/maps/search/?api=1&query=7.093917%2C80.318000')
            ->assertJsonPath('data.profile.maps_embed_url', fn (string $url) => str_starts_with($url, 'https://www.google.com/maps/embed?pb='))
            ->assertJsonPath('data.profile.opening_hours.0', ['day' => 'monday', 'closed' => false, 'open' => '11:00', 'close' => '22:30'])
            ->assertJsonPath('data.delivery_fee', 40000);
        $this->getJson('/api/v1/opening-hours')->assertJsonPath('data.temporarily_closed', false);

        $this->patchJson('/api/v1/admin/settings', [
            'contact_email' => 'not-an-email',
            'instagram_url' => 'https://evil.example/instagram.com',
            'facebook_url' => 'javascript:alert(1)',
            'maps_url' => 'https://evil.example/maps',
            'maps_embed_url' => 'https://www.google.com/maps/embed?pb=x"><script>',
        ], $headers)
            ->assertUnprocessable()->assertJsonValidationErrors(['contact_email', 'instagram_url', 'facebook_url', 'maps_url', 'maps_embed_url']);
        $this->patchJson('/api/v1/admin/settings', ['maps_url' => 'https://www.google.com/maps/place/Kegalle'], $headers)
            ->assertOk()->assertJsonPath('data.maps_url', 'https://www.google.com/maps/place/Kegalle');
        $this->patchJson('/api/v1/admin/settings', ['instagram_url' => null, 'facebook_url' => 'https://facebook.com/burgertheory'], $headers)
            ->assertOk()->assertJsonPath('data.instagram_url', null)->assertJsonPath('data.facebook_url', 'https://facebook.com/burgertheory');
    }

    public function test_logo_upload_replaces_the_previous_logo(): void
    {
        $storage = new FakeImageStorage;
        $this->app->instance(ImageStorage::class, $storage);
        $headers = $this->bearer($this->admin());

        $first = $this->post('/api/v1/admin/settings/logo', ['logo' => UploadedFile::fake()->image('logo.png', 400, 400)], $headers + ['Accept' => 'application/json'])
            ->assertOk()->json('data.logo_url');
        $this->assertStringContainsString('burger-theory/branding/', $first);

        $this->post('/api/v1/admin/settings/logo', ['logo' => UploadedFile::fake()->image('logo2.png', 400, 400)], $headers + ['Accept' => 'application/json'])->assertOk();
        $this->assertCount(1, $storage->deleted);

        $this->deleteJson('/api/v1/admin/settings/logo', [], $headers)->assertOk()->assertJsonPath('data.logo_url', null);
        $this->assertCount(2, $storage->deleted);
        $this->getJson('/api/v1/restaurant')->assertJsonPath('data.profile.logo_url', null);
    }

    public function test_coupon_dates_keep_their_timezone(): void
    {
        $headers = $this->bearer($this->admin());

        $this->postJson('/api/v1/admin/coupons', [
            'code' => 'NYE', 'discount_type' => 'percentage', 'percentage' => 15,
            // With an offset (what the admin portal sends) and without (restaurant time).
            'starts_at' => '2026-12-31T18:00:00+05:30',
            'expires_at' => '2026-12-31 23:59',
        ], $headers)
            ->assertCreated()
            ->assertJsonPath('data.starts_at', '2026-12-31T12:30:00+00:00')
            ->assertJsonPath('data.expires_at', '2026-12-31T18:29:00+00:00');
    }

    public function test_logo_upload_without_cloudinary_is_reported(): void
    {
        $this->post('/api/v1/admin/settings/logo', ['logo' => UploadedFile::fake()->image('logo.png', 400, 400)], $this->bearer($this->admin()) + ['Accept' => 'application/json'])
            ->assertStatus(503)->assertJsonPath('code', 'image_storage_not_configured');
    }
}
