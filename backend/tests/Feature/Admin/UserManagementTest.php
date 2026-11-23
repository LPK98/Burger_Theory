<?php

namespace Tests\Feature\Admin;

use App\Enums\UserRole;
use App\Exceptions\ApiException;
use App\Services\Admin\UserAdministration;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_admins_manage_users(): void
    {
        $customer = $this->customer();
        $other = $this->customer();
        $headers = $this->bearer($customer);

        $this->getJson('/api/v1/admin/users')->assertUnauthorized();
        $this->getJson('/api/v1/admin/users', $headers)->assertForbidden();
        $this->patchJson("/api/v1/admin/users/{$other->id}", ['suspended' => true], $headers)->assertForbidden();
        // A customer can't promote themselves either.
        $this->patchJson("/api/v1/admin/users/{$customer->id}", ['role' => 'admin'], $headers)->assertForbidden();
        $this->assertSame(UserRole::Customer, $customer->fresh()->role);
        $this->assertNull($other->fresh()->suspended_at);
    }

    public function test_admin_lists_and_filters_accounts(): void
    {
        $admin = $this->admin();
        $this->customer(['name' => 'Nimali Perera', 'email' => 'nimali@example.com']);
        $this->customer(['name' => 'Kasun Silva'])->forceFill(['suspended_at' => now()])->save();
        $headers = $this->bearer($admin);

        $this->getJson('/api/v1/admin/users', $headers)->assertOk()->assertJsonCount(3, 'data')->assertJsonMissingPath('data.0.password');
        $this->getJson('/api/v1/admin/users?role=admin', $headers)->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $admin->id);
        $this->getJson('/api/v1/admin/users?status=suspended', $headers)->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Kasun Silva');
        $this->getJson('/api/v1/admin/users?search=nimali', $headers)->assertJsonCount(1, 'data')->assertJsonPath('data.0.is_suspended', false);
        $this->getJson('/api/v1/admin/users?role=owner', $headers)->assertUnprocessable()->assertJsonValidationErrors('role');
        $this->getJson("/api/v1/admin/users/{$admin->id}", $headers)->assertOk()->assertJsonPath('data.role', 'admin')->assertJsonPath('data.orders_count', 0);
    }

    public function test_suspending_signs_the_account_out_and_blocks_sign_in(): void
    {
        $admin = $this->admin();
        $customer = $this->customer(['email' => 'kasun@example.com']);
        $customerToken = $this->bearer($customer);

        $this->patchJson("/api/v1/admin/users/{$customer->id}", ['suspended' => true, 'suspension_reason' => 'Repeated fake orders'], $this->bearer($admin))
            ->assertOk()
            ->assertJsonPath('data.is_suspended', true)
            ->assertJsonPath('data.suspension_reason', 'Repeated fake orders');

        $this->assertSame(0, $customer->tokens()->count());
        $this->app['auth']->forgetGuards(); // don't reuse the admin resolved by the previous request
        $this->getJson('/api/v1/user', $customerToken)->assertUnauthorized();
        $this->postJson('/api/v1/login', ['email' => 'kasun@example.com', 'password' => 'password1'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email');

        // A token that slipped through (e.g. suspended directly in the database) is rejected too.
        $other = $this->customer();
        $otherToken = $this->bearer($other);
        $other->forceFill(['suspended_at' => now()])->save();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/user', $otherToken)->assertUnauthorized();

        $this->patchJson("/api/v1/admin/users/{$customer->id}", ['suspended' => false], $this->bearer($admin))
            ->assertOk()->assertJsonPath('data.is_suspended', false)->assertJsonPath('data.suspension_reason', null);
        $this->postJson('/api/v1/login', ['email' => 'kasun@example.com', 'password' => 'password1'])->assertOk();
    }

    public function test_admin_promotes_and_demotes_but_never_themselves(): void
    {
        $admin = $this->admin();
        $staff = $this->customer();
        $headers = $this->bearer($admin);

        $this->patchJson("/api/v1/admin/users/{$staff->id}", ['role' => 'admin', 'name' => 'Kitchen Lead'], $headers)
            ->assertOk()->assertJsonPath('data.role', 'admin')->assertJsonPath('data.name', 'Kitchen Lead');
        $staffToken = $this->bearer($staff->fresh());
        $this->getJson('/api/v1/admin/dashboard', $staffToken)->assertOk();

        // Demotion revokes their tokens, so the admin portal session ends.
        $this->patchJson("/api/v1/admin/users/{$staff->id}", ['role' => 'customer'], $this->bearer($admin))->assertOk()->assertJsonPath('data.role', 'customer');
        $this->assertSame(0, $staff->tokens()->count());
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/admin/dashboard', $staffToken)->assertUnauthorized();

        foreach ([['role' => 'customer'], ['suspended' => true]] as $change) {
            $this->patchJson("/api/v1/admin/users/{$admin->id}", $change, $this->bearer($admin))
                ->assertUnprocessable()->assertJsonPath('code', 'cannot_modify_self');
        }
        // Their own name is fine.
        $this->patchJson("/api/v1/admin/users/{$admin->id}", ['name' => 'Head Admin'], $this->bearer($admin))->assertOk();
        $this->assertTrue($admin->fresh()->isAdmin());
    }

    public function test_an_admin_demoted_mid_request_cannot_demote_others(): void
    {
        // Two admins demote each other at the same moment: whichever runs second must fail,
        // so the restaurant is never left without an administrator.
        $first = $this->admin();
        $second = $this->admin();
        $users = app(UserAdministration::class);

        $users->update($first, $second, ['role' => 'customer']);

        try {
            $users->update($second, $first, ['role' => 'customer']);
            $this->fail('Expected the demoted admin to be refused.');
        } catch (ApiException $e) {
            $this->assertSame('forbidden', $e->errorCode);
        }
        $this->assertTrue($first->fresh()->isAdmin());
    }
}
