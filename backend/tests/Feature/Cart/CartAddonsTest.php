<?php

namespace Tests\Feature\Cart;

use App\Models\Addon;
use App\Models\Cart;
use App\Models\Order;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class CartAddonsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    /** @return array{0: Product, 1: Addon, 2: Addon} LKR 1,450 burger with cheddar (150, max 2) and bacon (350, max 1). */
    private function burger(int $stock = 10): array
    {
        $product = Product::factory()->price(145000)->stock($stock)->create(['name' => 'The Theory Classic']);
        $cheese = Addon::factory()->price(15000)->create(['name' => 'Extra cheddar', 'slug' => 'extra-cheddar', 'sort_order' => 1]);
        $bacon = Addon::factory()->price(35000)->create(['name' => 'Smoked bacon', 'slug' => 'smoked-bacon', 'sort_order' => 2]);
        $product->addons()->attach([
            $cheese->id => ['max_quantity' => 2, 'sort_order' => 1],
            $bacon->id => ['max_quantity' => 1, 'sort_order' => 2],
        ]);

        return [$product, $cheese, $bacon];
    }

    public function test_products_list_the_addons_customers_can_choose(): void
    {
        [$product, $cheese] = $this->burger();
        $hidden = Addon::factory()->unavailable()->create(['name' => 'Seasonal truffle']);
        $product->addons()->attach($hidden->id, ['max_quantity' => 1, 'sort_order' => 3]);

        $this->getJson("/api/v1/products/{$product->slug}")
            ->assertOk()
            ->assertJsonCount(2, 'data.addons')
            ->assertJsonPath('data.addons.0.id', $cheese->id)
            ->assertJsonPath('data.addons.0.price', 15000)
            ->assertJsonPath('data.addons.0.max_quantity', 2)
            ->assertJsonPath('data.addons.0.kind', 'topping');

        $this->getJson('/api/v1/addons')->assertOk()->assertJsonCount(2, 'data')->assertJsonMissingPath('data.0.is_available');

        // Administrators see every linked add-on, switched off or not.
        $this->getJson("/api/v1/admin/products/{$product->id}", $this->bearer($this->admin()))
            ->assertOk()
            ->assertJsonCount(3, 'data.addons')
            ->assertJsonPath('data.addons.2.is_available', false);
    }

    public function test_addons_are_priced_by_the_server_for_each_burger(): void
    {
        [$product, $cheese, $bacon] = $this->burger();

        $this->postJson('/api/v1/cart/items', [
            'product_id' => $product->id,
            'quantity' => 2,
            'addons' => [['addon_id' => $cheese->id, 'quantity' => 2], ['addon_id' => $bacon->id, 'price' => 1]],
            'unit_price' => 1,
        ])
            ->assertCreated()
            // 1,450 + 2 × 150 + 350 = 2,100 per burger.
            ->assertJsonPath('data.items.0.base_price', 145000)
            ->assertJsonPath('data.items.0.unit_price', 210000)
            ->assertJsonPath('data.items.0.line_total', 420000)
            ->assertJsonPath('data.items.0.addons.0.name', 'Extra cheddar')
            ->assertJsonPath('data.items.0.addons.0.quantity', 2)
            ->assertJsonPath('data.items.0.addons.0.unit_price', 15000)
            ->assertJsonPath('data.items.0.addons.1.quantity', 1)
            ->assertJsonPath('data.subtotal', 420000);

        // A later price change reaches the cart straight away.
        $cheese->update(['price' => 20000]);
        $item = $this->getJson('/api/v1/cart', ['X-Cart-Token' => Cart::query()->value('token')])->json('data.items.0');
        $this->assertSame(220000, $item['unit_price']);
    }

    public function test_each_addon_combination_is_its_own_line(): void
    {
        [$product, $cheese, $bacon] = $this->burger();
        $token = $this->postJson('/api/v1/cart/items', ['product_id' => $product->id])->json('data.token');
        $h = ['X-Cart-Token' => $token];

        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id], $h)->assertCreated();
        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'addons' => [['addon_id' => $cheese->id]]], $h)->assertCreated();
        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'addons' => [['addon_id' => $bacon->id], ['addon_id' => $cheese->id]]], $h)->assertCreated();
        // Same combination in a different order: same line.
        $cart = $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'addons' => [['addon_id' => $cheese->id], ['addon_id' => $bacon->id]]], $h)
            ->assertCreated()
            ->json('data');

        $this->assertCount(3, $cart['items']);
        $quantities = collect($cart['items'])->mapWithKeys(fn ($i) => [count($i['addons']) => $i['quantity']])->all();
        $this->assertSame([0 => 2, 1 => 1, 2 => 2], $quantities);
        $this->assertSame(5, $cart['item_count']);
    }

    public function test_addons_must_be_offered_switched_on_and_within_the_maximum(): void
    {
        [$product, $cheese, $bacon] = $this->burger();
        $notOffered = Addon::factory()->create();
        $switchedOff = Addon::factory()->unavailable()->create();
        $product->addons()->attach($switchedOff->id, ['max_quantity' => 1]);
        $deleted = Addon::factory()->create();
        $product->addons()->attach($deleted->id, ['max_quantity' => 1]);
        $deleted->delete();

        foreach ([$notOffered->id, $switchedOff->id, $deleted->id, 999999] as $id) {
            $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'addons' => [['addon_id' => $id]]])
                ->assertUnprocessable()
                ->assertJsonPath('code', 'addon_unavailable');
        }

        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'addons' => [['addon_id' => $cheese->id, 'quantity' => 3]]])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'addon_quantity_limit')
            ->assertJsonPath('details.max', 2);

        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'addons' => [['addon_id' => $bacon->id], ['addon_id' => $bacon->id]]])
            ->assertUnprocessable()->assertJsonValidationErrors('addons.0.addon_id');
        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'addons' => [['addon_id' => $bacon->id, 'quantity' => 0]]])
            ->assertUnprocessable()->assertJsonValidationErrors('addons.0.quantity');
        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'addons' => 'cheese'])
            ->assertUnprocessable()->assertJsonValidationErrors('addons');

        $this->assertDatabaseCount('cart_items', 0);
        $this->assertDatabaseCount('cart_item_addons', 0);
    }

    public function test_stock_covers_every_line_of_the_same_product(): void
    {
        [$product, $cheese] = $this->burger(stock: 3);
        $token = $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 2])->json('data.token');
        $h = ['X-Cart-Token' => $token];

        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 2, 'addons' => [['addon_id' => $cheese->id]]], $h)
            ->assertUnprocessable()
            ->assertJsonPath('code', 'insufficient_stock')
            ->assertJsonPath('details.available', 1);

        $cart = $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 1, 'addons' => [['addon_id' => $cheese->id]]], $h)
            ->assertCreated()->json('data');
        $this->assertSame(3, $cart['item_count']);

        // Raising the plain line now would oversell.
        $plain = collect($cart['items'])->firstWhere('addons', [])['id'];
        $this->patchJson("/api/v1/cart/items/{$plain}", ['quantity' => 3], $h)->assertUnprocessable()->assertJsonPath('code', 'insufficient_stock');
    }

    public function test_checkout_snapshots_the_addons_and_their_prices(): void
    {
        [$product, $cheese] = $this->burger();
        $user = $this->customer();
        $auth = $this->bearer($user);

        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 2, 'addons' => [['addon_id' => $cheese->id, 'quantity' => 2]]], $auth)->assertCreated();
        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 1], $auth)->assertCreated();

        $response = $this->postJson('/api/v1/orders', ['payment_method' => 'cod', 'fulfilment_type' => 'pickup'], $auth)
            ->assertCreated()
            // 2 × (1,450 + 300) + 1,450 = 4,950
            ->assertJsonPath('data.subtotal', 495000)
            ->assertJsonPath('data.total', 495000)
            ->assertJsonPath('data.item_count', 3);

        $items = collect($response->json('data.items'));
        $withCheese = $items->firstWhere('addons_unit_price', 30000);
        $this->assertSame(175000, $withCheese['unit_price']);
        $this->assertSame(145000, $withCheese['base_unit_price']);
        $this->assertSame(350000, $withCheese['line_total']);
        $this->assertSame([['addon_id' => $cheese->id, 'name' => 'Extra cheddar', 'quantity' => 2, 'unit_price' => 15000]], $withCheese['addons']);
        $this->assertSame([], $items->firstWhere('addons_unit_price', 0)['addons']);

        $this->assertDatabaseHas('order_items', ['unit_price' => '1750.00', 'addons_unit_price' => '300.00', 'quantity' => 2, 'line_total' => '3500.00']);
        $this->assertDatabaseHas('order_item_addons', ['addon_id' => $cheese->id, 'addon_name' => 'Extra cheddar', 'unit_price' => '150.00', 'quantity' => 2]);
        $this->assertSame(7, $product->fresh()->stock_quantity);
        $this->assertDatabaseCount('cart_item_addons', 0);

        // Later edits to the add-on don't touch the order.
        $cheese->update(['name' => 'Renamed', 'price' => 99900]);
        $cheese->delete();
        $this->getJson('/api/v1/orders/'.$response->json('data.order_number'), $auth)
            ->assertOk()
            ->assertJsonPath('data.subtotal', 495000);
        $this->assertDatabaseHas('order_item_addons', ['addon_name' => 'Extra cheddar', 'unit_price' => '150.00']);
    }

    public function test_an_addon_switched_off_after_adding_blocks_checkout(): void
    {
        [$product, , $bacon] = $this->burger();
        $user = $this->customer();
        $auth = $this->bearer($user);
        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'addons' => [['addon_id' => $bacon->id]]], $auth)->assertCreated();

        $bacon->update(['is_available' => false]);

        $this->getJson('/api/v1/cart', $auth)
            ->assertOk()
            ->assertJsonPath('data.items.0.issue', 'addon_unavailable')
            ->assertJsonPath('data.can_checkout', false)
            ->assertJsonPath('data.issues.0.code', 'addon_unavailable');

        $this->postJson('/api/v1/orders', ['payment_method' => 'cod', 'fulfilment_type' => 'pickup'], $auth)
            ->assertUnprocessable()
            ->assertJsonPath('code', 'addon_unavailable');
        $this->assertSame(0, Order::query()->count());
        $this->assertSame(10, $product->fresh()->stock_quantity);

        // Removing it from the product has the same effect once it is back on.
        $bacon->update(['is_available' => true]);
        $product->addons()->detach($bacon->id);
        $this->postJson('/api/v1/orders', ['payment_method' => 'cod', 'fulfilment_type' => 'pickup'], $auth)
            ->assertUnprocessable()
            ->assertJsonPath('code', 'addon_unavailable');
    }

    public function test_guest_cart_merge_keeps_addons(): void
    {
        [$product, $cheese] = $this->burger();
        $user = $this->customer();

        // Guest requests first: the test client would otherwise reuse the signed-in user.
        $token = $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'addons' => [['addon_id' => $cheese->id]]])->json('data.token');
        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id], ['X-Cart-Token' => $token])->assertCreated();

        $auth = $this->bearer($user);
        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'addons' => [['addon_id' => $cheese->id]]], $auth)->assertCreated();

        $cart = $this->postJson('/api/v1/cart/merge', ['cart_token' => $token], $auth)->assertOk()->json('data');

        $this->assertCount(2, $cart['items']);
        $withCheese = collect($cart['items'])->first(fn ($i) => $i['addons'] !== []);
        $this->assertSame(2, $withCheese['quantity']);
        $this->assertSame($cheese->id, $withCheese['addons'][0]['id']);
        $this->assertSame(160000, $withCheese['unit_price']);
        $this->assertDatabaseCount('carts', 1);
    }
}
