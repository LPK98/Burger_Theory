<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\FulfilmentType;
use App\Http\Controllers\Controller;
use App\Http\Requests\Cart\AddCartItemRequest;
use App\Http\Requests\Cart\ApplyCouponRequest;
use App\Http\Requests\Cart\MergeCartRequest;
use App\Http\Requests\Cart\ShowCartRequest;
use App\Http\Requests\Cart\UpdateCartItemRequest;
use App\Http\Resources\CartResource;
use App\Models\Cart;
use App\Models\CartItem;
use App\Models\Product;
use App\Services\Cart\CartResolver;
use App\Services\Cart\CartService;
use App\Services\Cart\PricingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Cart for guests and customers.
 *
 * Guests: the first write returns `data.token`; send it as `X-Cart-Token` on later
 * cart requests. Customers: send the Bearer token; the cart follows the account.
 * Totals are always calculated by the server (integer cents).
 *
 * @tags Cart
 */
class CartController extends Controller
{
    public function __construct(
        private readonly CartResolver $resolver,
        private readonly CartService $carts,
        private readonly PricingService $pricing,
    ) {}

    /**
     * Show the cart.
     *
     * @unauthenticated
     */
    public function show(ShowCartRequest $request): JsonResponse
    {
        $cart = $this->resolver->find($request) ?? $this->emptyCart($request);

        return $this->respond($request, $cart, fulfilment: $request->fulfilment());
    }

    /**
     * Add a product.
     *
     * Adds to the existing line if the product is already in the cart with the same add-ons;
     * a different add-on combination becomes its own line.
     *
     * @unauthenticated
     */
    public function addItem(AddCartItemRequest $request): JsonResponse
    {
        $product = $request->filled('product_id')
            ? Product::query()->find($request->integer('product_id'))
            : Product::query()->where('slug', $request->validated('product_slug'))->first();

        if ($product === null) {
            throw ValidationException::withMessages(['product_id' => 'That product does not exist.']);
        }

        $cart = $this->resolver->findOrCreate($request);
        $this->carts->add($cart, $product, $request->integer('quantity', 1), $request->addonQuantities());

        return $this->respond($request, $cart, 201);
    }

    /**
     * Change a line's quantity (0 removes it).
     *
     * @unauthenticated
     */
    public function updateItem(UpdateCartItemRequest $request, CartItem $item): JsonResponse
    {
        $cart = $this->cartOwning($request, $item);
        $quantity = $request->integer('quantity');

        $quantity === 0 ? $this->carts->remove($item) : $this->carts->setQuantity($cart, $item, $quantity);

        return $this->respond($request, $cart);
    }

    /**
     * Remove a line.
     *
     * @unauthenticated
     */
    public function removeItem(Request $request, CartItem $item): JsonResponse
    {
        $cart = $this->cartOwning($request, $item);
        $this->carts->remove($item);

        return $this->respond($request, $cart);
    }

    /**
     * Empty the cart.
     *
     * @unauthenticated
     */
    public function clear(Request $request): JsonResponse
    {
        $cart = $this->resolver->find($request);
        if ($cart === null) {
            return $this->respond($request, $this->emptyCart($request));
        }
        $this->carts->clear($cart);

        return $this->respond($request, $cart);
    }

    /**
     * Apply a coupon code.
     *
     * @unauthenticated
     */
    public function applyCoupon(ApplyCouponRequest $request): JsonResponse
    {
        $cart = $this->resolver->findOrCreate($request);
        $this->carts->applyCoupon($cart, $request->validated('code'), $request->user());

        return $this->respond($request, $cart);
    }

    /**
     * Remove the coupon.
     *
     * @unauthenticated
     */
    public function removeCoupon(Request $request): JsonResponse
    {
        $cart = $this->resolver->find($request);
        if ($cart === null) {
            return $this->respond($request, $this->emptyCart($request));
        }
        $this->carts->removeCoupon($cart);

        return $this->respond($request, $cart);
    }

    /**
     * Merge a guest cart into your cart.
     *
     * Call after login/registration with the guest token. Lines with the same product and
     * add-ons are combined and capped by stock; unavailable products (or add-ons) are dropped;
     * the guest cart is deleted.
     */
    public function merge(MergeCartRequest $request): JsonResponse
    {
        $target = $this->resolver->findOrCreate($request);
        $guest = $this->resolver->findGuestCart($request->validated('cart_token'));

        if ($guest !== null) {
            $target = $this->carts->merge($guest, $target);
        }

        return $this->respond($request, $target);
    }

    private function cartOwning(Request $request, CartItem $item): Cart
    {
        $cart = $this->resolver->find($request);
        abort_if($cart === null || $item->cart_id !== $cart->id, 404);

        return $cart;
    }

    private function emptyCart(Request $request): Cart
    {
        $cart = new Cart(['user_id' => $request->user()?->id]);
        $cart->setRelation('items', collect());
        $cart->setRelation('coupon', null);

        return $cart;
    }

    private function respond(Request $request, Cart $cart, int $status = 200, ?FulfilmentType $fulfilment = null): JsonResponse
    {
        if ($cart->exists) {
            $cart->unsetRelations();
        }
        $fulfilment ??= FulfilmentType::tryFrom((string) $request->query('fulfilment_type')) ?? FulfilmentType::Delivery;
        $quote = $this->pricing->quoteCart($cart, $fulfilment, $request->user());

        $response = (new CartResource($cart, $quote))->response()->setStatusCode($status);
        if ($cart->exists && $cart->user_id === null) {
            $response->headers->set(CartResolver::HEADER, $cart->token);
        }

        return $response;
    }
}
