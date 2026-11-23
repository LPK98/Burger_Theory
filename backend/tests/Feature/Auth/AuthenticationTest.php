<?php

namespace Tests\Feature\Auth;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthenticationTest extends TestCase
{
    use RefreshDatabase;

    public function test_customer_can_register_and_receives_a_token(): void
    {
        $response = $this->postJson('/api/v1/register', [
            'name' => 'Nimali Perera',
            'email' => 'Nimali@Example.com',
            'phone' => '0771234567',
            'password' => 'burger1234',
            'password_confirmation' => 'burger1234',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.user.email', 'nimali@example.com')
            ->assertJsonPath('data.user.role', 'customer')
            ->assertJsonPath('data.token_type', 'Bearer')
            ->assertJsonMissingPath('data.user.password');

        $user = User::query()->where('email', 'nimali@example.com')->firstOrFail();
        $this->assertTrue(Hash::check('burger1234', $user->password));
        $this->assertNotSame('burger1234', $user->password);

        $this->getJson('/api/v1/user', ['Authorization' => 'Bearer '.$response->json('data.token')])
            ->assertOk()
            ->assertJsonPath('data.email', 'nimali@example.com');
    }

    public function test_registration_cannot_grant_admin_role(): void
    {
        $this->postJson('/api/v1/register', [
            'name' => 'Sneaky',
            'email' => 'sneaky@example.com',
            'password' => 'burger1234',
            'password_confirmation' => 'burger1234',
            'role' => 'admin',
        ])->assertCreated()->assertJsonPath('data.user.role', 'customer');

        $this->assertSame(UserRole::Customer, User::query()->where('email', 'sneaky@example.com')->firstOrFail()->role);
    }

    public function test_registration_validates_input_and_rejects_duplicate_emails_case_insensitively(): void
    {
        $this->customer(['email' => 'taken@example.com']);

        $this->postJson('/api/v1/register', [
            'name' => '',
            'email' => 'TAKEN@example.com',
            'password' => 'short',
            'password_confirmation' => 'different',
        ])->assertUnprocessable()->assertJsonValidationErrors(['name', 'email', 'password']);
    }

    public function test_login_with_valid_and_invalid_credentials(): void
    {
        $this->customer(['email' => 'kasun@example.com', 'password' => 'burger1234']);

        $this->postJson('/api/v1/login', ['email' => 'KASUN@example.com', 'password' => 'burger1234'])
            ->assertOk()
            ->assertJsonStructure(['data' => ['user' => ['id', 'name', 'email', 'role'], 'token', 'token_type']]);

        $this->postJson('/api/v1/login', ['email' => 'kasun@example.com', 'password' => 'wrong-password'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email');

        $this->postJson('/api/v1/login', ['email' => 'nobody@example.com', 'password' => 'burger1234'])
            ->assertUnprocessable();
    }

    public function test_login_is_rate_limited(): void
    {
        $this->customer(['email' => 'kasun@example.com']);

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/login', ['email' => 'kasun@example.com', 'password' => 'wrong'])->assertUnprocessable();
        }

        $this->postJson('/api/v1/login', ['email' => 'kasun@example.com', 'password' => 'wrong'])->assertTooManyRequests();
    }

    public function test_logout_revokes_the_token(): void
    {
        $user = $this->customer();
        $token = $user->createToken('test')->plainTextToken;

        $this->postJson('/api/v1/logout', [], ['Authorization' => "Bearer {$token}"])->assertNoContent();

        $this->assertDatabaseCount('personal_access_tokens', 0);
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/user', ['Authorization' => "Bearer {$token}"])->assertUnauthorized();
    }

    public function test_protected_endpoints_require_authentication(): void
    {
        foreach (['/api/v1/user', '/api/v1/orders', '/api/v1/addresses', '/api/v1/admin/dashboard'] as $uri) {
            $this->getJson($uri)->assertUnauthorized()->assertJsonPath('message', 'Unauthenticated.');
        }
    }

    public function test_profile_update_cannot_change_role(): void
    {
        $user = $this->customer();

        $this->patchJson('/api/v1/user', ['name' => 'New Name', 'role' => 'admin'], $this->bearer($user))
            ->assertOk()
            ->assertJsonPath('data.name', 'New Name')
            ->assertJsonPath('data.role', 'customer');

        $this->assertFalse($user->fresh()->isAdmin());
    }

    public function test_password_change_requires_current_password_and_revokes_other_sessions(): void
    {
        $user = $this->customer(['password' => 'burger1234']);
        $otherDevice = $user->createToken('phone')->plainTextToken;
        $headers = $this->bearer($user);

        $this->putJson('/api/v1/user/password', [
            'current_password' => 'not-my-password',
            'password' => 'newburger99',
            'password_confirmation' => 'newburger99',
        ], $headers)->assertUnprocessable()->assertJsonValidationErrors('current_password');

        $this->putJson('/api/v1/user/password', [
            'current_password' => 'burger1234',
            'password' => 'newburger99',
            'password_confirmation' => 'newburger99',
        ], $headers)->assertOk();

        $this->assertTrue(Hash::check('newburger99', $user->fresh()->password));
        $this->assertSame(1, $user->tokens()->count());

        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/user', ['Authorization' => "Bearer {$otherDevice}"])->assertUnauthorized();
    }

    public function test_customers_cannot_use_admin_endpoints(): void
    {
        $this->getJson('/api/v1/admin/dashboard', $this->bearer($this->customer()))
            ->assertForbidden()
            ->assertJsonPath('code', 'forbidden');

        $this->getJson('/api/v1/admin/dashboard', $this->bearer($this->admin()))->assertOk();
    }
}
