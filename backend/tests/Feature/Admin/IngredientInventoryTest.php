<?php

namespace Tests\Feature\Admin;

use App\Models\Ingredient;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class IngredientInventoryTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_adds_an_ingredient_with_opening_stock(): void
    {
        $headers = $this->bearer($this->admin());

        $this->postJson('/api/v1/admin/ingredients', [
            'name' => 'Brioche bun', 'unit' => 'pcs', 'stock_quantity' => 120, 'min_stock_level' => 40, 'notes' => 'Baked daily',
        ], $headers)
            ->assertCreated()
            ->assertJsonPath('data.name', 'Brioche bun')
            ->assertJsonPath('data.stock_quantity', 120)
            ->assertJsonPath('data.min_stock_level', 40)
            ->assertJsonPath('data.stock_status', 'in_stock');

        $ingredient = Ingredient::query()->firstOrFail();
        $this->getJson("/api/v1/admin/ingredients/{$ingredient->id}/movements", $headers)
            ->assertOk()
            ->assertJsonPath('data.0.reason', 'restock')
            ->assertJsonPath('data.0.change', 120)
            ->assertJsonPath('data.0.note', 'Opening stock');

        // Names are unique regardless of case; the unit is fixed after creation.
        $this->postJson('/api/v1/admin/ingredients', ['name' => 'BRIOCHE BUN', 'unit' => 'pcs'], $headers)
            ->assertUnprocessable()->assertJsonValidationErrors('name');
        $this->patchJson("/api/v1/admin/ingredients/{$ingredient->id}", ['unit' => 'kg'], $headers)
            ->assertUnprocessable()->assertJsonValidationErrors('unit');
        $this->patchJson("/api/v1/admin/ingredients/{$ingredient->id}", ['stock_quantity' => 5], $headers)
            ->assertUnprocessable()->assertJsonValidationErrors('stock_quantity');
        $this->patchJson("/api/v1/admin/ingredients/{$ingredient->id}", ['min_stock_level' => 150], $headers)
            ->assertOk()->assertJsonPath('data.stock_status', 'low_stock');
    }

    public function test_stock_adjustments_are_logged_and_guarded(): void
    {
        $headers = $this->bearer($this->admin());
        $beef = $this->ingredient('Beef patty mix', 'kg', '10', '4');

        // Restock adds; decimals keep three places.
        $this->postJson("/api/v1/admin/ingredients/{$beef->id}/adjustments", ['reason' => 'restock', 'change' => 2.255, 'note' => 'Supplier delivery'], $headers)
            ->assertCreated()
            ->assertJsonPath('data.ingredient.stock_quantity', 12.255)
            ->assertJsonPath('data.movement.quantity_before', 10)
            ->assertJsonPath('data.movement.quantity_after', 12.255);

        // Waste removes even when sent as a positive amount.
        $this->postJson("/api/v1/admin/ingredients/{$beef->id}/adjustments", ['reason' => 'waste', 'change' => 0.255], $headers)
            ->assertCreated()->assertJsonPath('data.ingredient.stock_quantity', 12);

        // A stock count sets the counted amount.
        $this->postJson("/api/v1/admin/ingredients/{$beef->id}/adjustments", ['reason' => 'adjustment', 'set_to' => 9.5], $headers)
            ->assertCreated()->assertJsonPath('data.movement.change', -2.5)->assertJsonPath('data.ingredient.stock_quantity', 9.5);

        // Guards: below zero, a negative restock, no-op counts, unknown reasons.
        $this->postJson("/api/v1/admin/ingredients/{$beef->id}/adjustments", ['reason' => 'waste', 'change' => 20], $headers)
            ->assertUnprocessable()->assertJsonValidationErrors('change');
        $this->postJson("/api/v1/admin/ingredients/{$beef->id}/adjustments", ['reason' => 'restock', 'change' => -1], $headers)
            ->assertUnprocessable()->assertJsonValidationErrors('change');
        $this->postJson("/api/v1/admin/ingredients/{$beef->id}/adjustments", ['reason' => 'adjustment', 'set_to' => 9.5], $headers)
            ->assertUnprocessable()->assertJsonValidationErrors('set_to');
        $this->postJson("/api/v1/admin/ingredients/{$beef->id}/adjustments", ['reason' => 'consumption', 'change' => 1], $headers)
            ->assertUnprocessable()->assertJsonValidationErrors('reason');

        $this->assertSame('9.500', $beef->refresh()->stock_quantity);
        $this->assertSame(3, $beef->movements()->count());
    }

    public function test_orders_consume_ingredients_through_the_recipe_and_cancellations_return_them(): void
    {
        $admin = $this->admin();
        $headers = $this->bearer($admin);
        $bun = $this->ingredient('Brioche bun', 'pcs', '10', '5');
        $beef = $this->ingredient('Beef', 'g', '1000', '300');
        $classic = Product::factory()->price(145000)->stock(50)->create(['name' => 'Classic']);

        $this->putJson("/api/v1/admin/products/{$classic->id}/recipe", ['items' => [
            ['ingredient_id' => $bun->id, 'quantity' => 1],
            ['ingredient_id' => $beef->id, 'quantity' => 180],
        ]], $headers)
            ->assertOk()
            ->assertJsonCount(2, 'data.recipe')
            ->assertJsonPath('data.recipe.0.name', 'Beef')
            ->assertJsonPath('data.recipe.0.quantity', 180);

        $number = $this->placeOrder($this->customer(), [[$classic, 3]])->assertCreated()->json('data.order_number');

        $this->assertSame('7.000', $bun->refresh()->stock_quantity);
        $this->assertSame('460.000', $beef->refresh()->stock_quantity);

        // Last week's usage and stock status come back with the list.
        $list = $this->getJson('/api/v1/admin/ingredients?sort=urgency', $this->bearer($admin))->assertOk();
        $this->assertSame(['Brioche bun', 'Beef'], array_column($list->json('data'), 'name'));
        $list->assertJsonPath('data.1.used_last_7_days', 540)->assertJsonPath('data.1.products_count', 1);

        $this->patchJson("/api/v1/admin/orders/{$number}/status", ['status' => 'rejected', 'note' => 'Out of buns'], $this->bearer($admin))->assertOk();
        $this->assertSame('10.000', $bun->refresh()->stock_quantity);
        $this->assertSame('1000.000', $beef->refresh()->stock_quantity);

        $this->getJson("/api/v1/admin/inventory/movements?reason=order_release", $this->bearer($admin))
            ->assertOk()->assertJsonCount(2, 'data')->assertJsonPath('data.0.order_number', $number);

        // Net usage after the return is zero.
        $consumption = collect($this->getJson('/api/v1/admin/inventory/consumption', $this->bearer($admin))->json('data.ingredients'))->keyBy('name');
        $this->assertSame(0, $consumption['Beef']['used']);
    }

    public function test_a_short_ingredient_never_blocks_an_order_and_is_reported(): void
    {
        $admin = $this->admin();
        $patty = $this->ingredient('Patty', 'pcs', '1', '2');
        $classic = Product::factory()->stock(50)->create();
        $this->putJson("/api/v1/admin/products/{$classic->id}/recipe", ['items' => [['ingredient_id' => $patty->id, 'quantity' => 2]]], $this->bearer($admin))->assertOk();

        $this->placeOrder($this->customer(), [[$classic, 2]])->assertCreated();

        $this->assertSame('-3.000', $patty->refresh()->stock_quantity);
        $this->getJson('/api/v1/admin/ingredients?status=out_of_stock', $this->bearer($admin))
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.stock_quantity', -3)->assertJsonPath('data.0.stock_status', 'out_of_stock');
        $this->getJson('/api/v1/admin/dashboard', $this->bearer($admin))
            ->assertJsonPath('data.low_stock_ingredients.0.name', 'Patty');
    }

    public function test_recipe_validation_and_ingredient_removal(): void
    {
        $headers = $this->bearer($this->admin());
        $cheese = $this->ingredient('Cheddar', 'pcs', '50', '10');
        $product = Product::factory()->create();

        $this->putJson("/api/v1/admin/products/{$product->id}/recipe", ['items' => [['ingredient_id' => $cheese->id, 'quantity' => 0]]], $headers)
            ->assertUnprocessable()->assertJsonValidationErrors('items.0.quantity');
        $this->putJson("/api/v1/admin/products/{$product->id}/recipe", ['items' => [['ingredient_id' => 999, 'quantity' => 1]]], $headers)
            ->assertUnprocessable()->assertJsonValidationErrors('items.0.ingredient_id');
        $this->putJson("/api/v1/admin/products/{$product->id}/recipe", ['items' => [['ingredient_id' => $cheese->id, 'quantity' => 2]]], $headers)->assertOk();

        $this->deleteJson("/api/v1/admin/ingredients/{$cheese->id}", [], $headers)->assertNoContent();
        $this->getJson("/api/v1/admin/products/{$product->id}", $headers)->assertJsonCount(0, 'data.recipe');
        $this->assertSoftDeleted($cheese);

        // The name is free again once the old ingredient is gone.
        $this->postJson('/api/v1/admin/ingredients', ['name' => 'Cheddar', 'unit' => 'g'], $headers)->assertCreated();
    }

    private function ingredient(string $name, string $unit, string $stock, string $min): Ingredient
    {
        $ingredient = Ingredient::query()->create(['name' => $name, 'unit' => $unit, 'min_stock_level' => $min]);
        $ingredient->forceFill(['stock_quantity' => $stock])->save();

        return $ingredient;
    }
}
