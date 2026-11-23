<?php

namespace Tests\Feature\Admin;

use App\Models\AdminActivityLog;
use App\Models\Category;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ActivityLogTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_writes_are_logged_and_reads_are_not(): void
    {
        $admin = $this->admin();
        $headers = $this->bearer($admin);
        $category = Category::factory()->create();

        $this->getJson('/api/v1/admin/products', $headers)->assertOk();
        $this->assertDatabaseCount('admin_activity_logs', 0);

        $id = $this->postJson('/api/v1/admin/products', ['name' => 'Fire House', 'price' => 159000, 'category_ids' => [$category->id]], $headers)
            ->assertCreated()->json('data.id');
        $this->patchJson("/api/v1/admin/products/{$id}", ['price' => 169000], $headers)->assertOk();
        $this->deleteJson("/api/v1/admin/products/{$id}", [], $headers)->assertNoContent();
        // Rejected requests change nothing and aren't logged.
        $this->postJson('/api/v1/admin/products', [], $headers)->assertUnprocessable();

        $logs = AdminActivityLog::query()->orderBy('id')->get();
        $this->assertSame(['admin.products.store', 'admin.products.update', 'admin.products.destroy'], $logs->pluck('action')->all());
        $this->assertSame([201, 200, 204], $logs->pluck('status_code')->all());
        $this->assertTrue($logs->every(fn ($log) => $log->user_id === $admin->id && $log->subject_type === 'product' && $log->subject_id === (string) $id));
        $this->assertSame(169000, $logs[1]->properties['input']['price']);
        $this->assertSame('PATCH', $logs[1]->method);
        $this->assertSame("/api/v1/admin/products/{$id}", $logs[1]->path);
    }

    public function test_sensitive_fields_are_never_stored(): void
    {
        $admin = $this->admin();
        $customer = $this->customer();

        $this->patchJson("/api/v1/admin/users/{$customer->id}", [
            'name' => 'Renamed',
            'password' => 'should-not-appear',
            'api_token' => 'nor-this',
        ], $this->bearer($admin))->assertOk();

        $log = AdminActivityLog::query()->sole();
        $this->assertSame('admin.users.update', $log->action);
        $this->assertSame('user', $log->subject_type);
        $this->assertSame('[redacted]', $log->properties['input']['password']);
        $this->assertSame('[redacted]', $log->properties['input']['api_token']);
        $this->assertStringNotContainsString('should-not-appear', json_encode($log->properties));
    }

    public function test_admin_sign_in_is_logged_and_the_log_can_be_filtered(): void
    {
        $admin = User::factory()->admin()->create(['email' => 'admin@example.test']);
        $this->postJson('/api/v1/admin/login', ['email' => 'admin@example.test', 'password' => 'password1'])->assertOk();
        $this->assertDatabaseHas('admin_activity_logs', ['user_id' => $admin->id, 'action' => 'admin.login', 'subject_type' => 'user']);
        $this->assertStringNotContainsString('password1', json_encode(AdminActivityLog::query()->sole()->properties));

        $headers = $this->bearer($admin);
        $product = Product::factory()->create();
        $this->postJson("/api/v1/admin/products/{$product->id}/stock", ['change' => 5, 'reason' => 'restock'], $headers)->assertSuccessful();

        $this->getJson('/api/v1/admin/activity-logs', $headers)
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.action', 'admin.products.stock.store')
            ->assertJsonPath('data.0.user.email', 'admin@example.test');
        $this->getJson('/api/v1/admin/activity-logs?action=admin.products', $headers)->assertJsonCount(1, 'data');
        $this->getJson("/api/v1/admin/activity-logs?subject_type=product&subject_id={$product->id}", $headers)->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/admin/activity-logs?from='.now('Asia/Colombo')->toDateString(), $headers)->assertJsonCount(2, 'data');
        $this->getJson('/api/v1/admin/activity-logs?to='.now('Asia/Colombo')->subDay()->toDateString(), $headers)->assertJsonCount(0, 'data');

        $this->getJson('/api/v1/admin/activity-logs', $this->bearer($this->customer()))->assertForbidden();
    }
}
