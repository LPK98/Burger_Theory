<?php

namespace Tests\Feature\Admin;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminAuthTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'Correct-horse-42';

    public function test_admin_logs_in_and_the_token_opens_admin_endpoints(): void
    {
        $admin = User::factory()->admin()->create(['email' => 'chef@example.test', 'password' => self::PASSWORD]);

        $response = $this->postJson('/api/v1/admin/login', ['email' => 'CHEF@example.test', 'password' => self::PASSWORD])
            ->assertOk()
            ->assertJsonPath('data.user.role', 'admin')
            ->assertJsonPath('data.user.email', 'chef@example.test')
            ->assertJsonMissingPath('data.user.password');

        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/admin/dashboard', ['Authorization' => 'Bearer '.$response->json('data.token')])->assertOk();
        $this->assertSame('admin-portal', $admin->tokens()->value('name'));
    }

    public function test_customers_get_the_same_answer_as_a_wrong_password_and_no_token(): void
    {
        $customer = $this->customer(['email' => 'diner@example.test', 'password' => self::PASSWORD]);
        $this->admin();

        $asCustomer = $this->postJson('/api/v1/admin/login', ['email' => 'diner@example.test', 'password' => self::PASSWORD])
            ->assertUnprocessable()->json('errors.email.0');
        $wrongPassword = $this->postJson('/api/v1/admin/login', ['email' => 'diner@example.test', 'password' => 'Wrong-password-1'])
            ->assertUnprocessable()->json('errors.email.0');
        $unknown = $this->postJson('/api/v1/admin/login', ['email' => 'nobody@example.test', 'password' => self::PASSWORD])
            ->assertUnprocessable()->json('errors.email.0');

        $this->assertSame($asCustomer, $wrongPassword);
        $this->assertSame($asCustomer, $unknown);
        $this->assertSame(0, $customer->tokens()->count());
    }

    public function test_there_is_no_admin_registration_and_customer_registration_ignores_the_role(): void
    {
        $this->postJson('/api/v1/admin/register', ['email' => 'x@example.test'])->assertNotFound();

        $this->postJson('/api/v1/register', [
            'name' => 'Sneaky', 'email' => 'sneaky@example.test', 'role' => 'admin',
            'password' => self::PASSWORD, 'password_confirmation' => self::PASSWORD,
        ])->assertCreated()->assertJsonPath('data.user.role', 'customer');
    }

    public function test_customers_and_guests_are_kept_out_of_every_admin_endpoint(): void
    {
        $customer = $this->customer();
        $endpoints = [
            ['GET', '/api/v1/admin/dashboard'],
            ['GET', '/api/v1/admin/customers'],
            ['GET', '/api/v1/admin/customers/'.$customer->id],
            ['GET', '/api/v1/admin/payments'],
            ['GET', '/api/v1/admin/ingredients'],
            ['POST', '/api/v1/admin/ingredients'],
            ['GET', '/api/v1/admin/inventory/movements'],
            ['GET', '/api/v1/admin/inventory/consumption'],
            ['GET', '/api/v1/admin/reports/orders'],
            ['GET', '/api/v1/admin/reports/sales'],
            ['GET', '/api/v1/admin/settings'],
            ['POST', '/api/v1/admin/settings/logo'],
        ];

        foreach ($endpoints as [$method, $uri]) {
            $this->json($method, $uri, [], $this->bearer($customer))->assertForbidden();
            $this->app['auth']->forgetGuards();
            $this->json($method, $uri)->assertUnauthorized();
        }
    }
}
