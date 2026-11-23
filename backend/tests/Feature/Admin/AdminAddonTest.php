<?php

namespace Tests\Feature\Admin;

use App\Models\Addon;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminAddonTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_admins_manage_addons(): void
    {
        $addon = Addon::factory()->create();
        $product = Product::factory()->create();
        $customer = $this->bearer($this->customer());

        $this->getJson('/api/v1/admin/addons')->assertUnauthorized();
        $this->getJson('/api/v1/admin/addons', $customer)->assertForbidden();
        $this->postJson('/api/v1/admin/addons', ['name' => 'X', 'price' => 1], $customer)->assertForbidden();
        $this->patchJson("/api/v1/admin/addons/{$addon->id}", ['price' => 1], $customer)->assertForbidden();
        $this->deleteJson("/api/v1/admin/addons/{$addon->id}", [], $customer)->assertForbidden();
        $this->putJson("/api/v1/admin/products/{$product->id}/addons", ['addons' => []], $customer)->assertForbidden();
        $this->assertNotSame(1, $addon->fresh()->price);
    }

    public function test_admin_creates_updates_lists_and_deletes_an_addon(): void
    {
        $headers = $this->bearer($this->admin());

        $id = $this->postJson('/api/v1/admin/addons', ['name' => 'Smoked Bacon', 'price' => 35000, 'kind' => 'topping', 'description' => 'Two rashers'], $headers)
            ->assertCreated()
            ->assertJsonPath('data.slug', 'smoked-bacon')
            ->assertJsonPath('data.price', 35000)
            ->assertJsonPath('data.is_available', true)
            ->assertJsonPath('data.products_count', 0)
            ->json('data.id');
        $this->assertDatabaseHas('addons', ['id' => $id, 'price' => '350.00', 'kind' => 'topping']);

        $this->patchJson("/api/v1/admin/addons/{$id}", ['price' => 40000, 'is_available' => false], $headers)
            ->assertOk()->assertJsonPath('data.price', 40000)->assertJsonPath('data.is_available', false);
        $this->getJson('/api/v1/admin/addons/smoked-bacon', $headers)->assertOk()->assertJsonPath('data.id', $id);
        $this->getJson('/api/v1/admin/addons?is_available=0', $headers)->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/admin/addons?kind=sauce', $headers)->assertOk()->assertJsonCount(0, 'data');

        $this->deleteJson("/api/v1/admin/addons/{$id}", [], $headers)->assertNoContent();
        $this->assertSoftDeleted('addons', ['id' => $id]);
        $this->getJson('/api/v1/admin/addons', $headers)->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/admin/addons?with_trashed=1', $headers)->assertJsonCount(1, 'data');

        // The slug is free again once the old add-on is deleted.
        $this->postJson('/api/v1/admin/addons', ['name' => 'Smoked bacon', 'price' => 35000], $headers)->assertCreated();
    }

    public function test_addon_validation(): void
    {
        $headers = $this->bearer($this->admin());
        Addon::factory()->create(['slug' => 'extra-cheddar']);

        $this->postJson('/api/v1/admin/addons', [], $headers)->assertUnprocessable()->assertJsonValidationErrors(['name', 'price']);
        $this->postJson('/api/v1/admin/addons', ['name' => 'Extra cheddar', 'price' => 100], $headers)->assertUnprocessable()->assertJsonValidationErrors('slug');
        $this->postJson('/api/v1/admin/addons', ['name' => 'Egg', 'price' => -1, 'kind' => 'dessert'], $headers)->assertUnprocessable()->assertJsonValidationErrors(['price', 'kind']);
        $this->postJson('/api/v1/admin/addons', ['name' => 'Egg', 'price' => 1.5], $headers)->assertUnprocessable()->assertJsonValidationErrors('price');
    }

    public function test_admin_sets_the_addons_a_product_offers(): void
    {
        $headers = $this->bearer($this->admin());
        $product = Product::factory()->create();
        [$cheese, $bacon, $egg] = Addon::factory()->count(3)->create();
        $gone = Addon::factory()->create();
        $gone->delete();

        $this->putJson("/api/v1/admin/products/{$product->id}/addons", ['addons' => [
            ['addon_id' => $bacon->id, 'max_quantity' => 2],
            ['addon_id' => $cheese->id],
        ]], $headers)
            ->assertOk()
            ->assertJsonCount(2, 'data.addons')
            ->assertJsonPath('data.addons.0.id', $bacon->id)
            ->assertJsonPath('data.addons.0.max_quantity', 2)
            ->assertJsonPath('data.addons.1.max_quantity', 1);

        // Replaces the whole list.
        $this->putJson("/api/v1/admin/products/{$product->id}/addons", ['addons' => [['addon_id' => $egg->id]]], $headers)
            ->assertOk()->assertJsonCount(1, 'data.addons')->assertJsonPath('data.addons.0.id', $egg->id);
        $this->getJson("/api/v1/admin/addons/{$egg->id}", $headers)->assertJsonPath('data.products.0.id', $product->id)->assertJsonPath('data.products_count', 1);

        $this->putJson("/api/v1/admin/products/{$product->id}/addons", ['addons' => [['addon_id' => $gone->id]]], $headers)
            ->assertUnprocessable()->assertJsonValidationErrors('addons.0.addon_id');
        $this->putJson("/api/v1/admin/products/{$product->id}/addons", ['addons' => [['addon_id' => $egg->id, 'max_quantity' => 11]]], $headers)
            ->assertUnprocessable()->assertJsonValidationErrors('addons.0.max_quantity');
        $this->putJson("/api/v1/admin/products/{$product->id}/addons", ['addons' => [['addon_id' => $egg->id], ['addon_id' => $egg->id]]], $headers)
            ->assertUnprocessable()->assertJsonValidationErrors('addons.0.addon_id');

        $this->putJson("/api/v1/admin/products/{$product->id}/addons", ['addons' => []], $headers)->assertOk()->assertJsonCount(0, 'data.addons');
        $this->assertDatabaseCount('addon_product', 0);
    }
}
