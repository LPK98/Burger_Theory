# Connecting the storefront to the API

This guide is for whoever wires `Burger_frontend` to the backend. The backend was built without touching the frontend. Everything below is additive: no component, animation, GSAP timeline or style needs to change. The work is in `src/services/`, `src/context/CartContext.tsx` and one constant in `src/data/site.ts`.

Two ready-made files are in [frontend-integration/](frontend-integration/). Both type-check under the storefront's TypeScript 7 in strict mode with Axios 1.x.

| File | Copy to | What it is |
| --- | --- | --- |
| `api-types.ts` | `src/services/api/types.ts` | Every request and response type, enum and error code. |
| `api-client.ts` | `src/services/api/client.ts` | Axios instance, token handling, typed calls, a PayHere redirect helper, and the `toStorefrontProduct()` adapter. |

---

## 1. Configuration

```bash
cd Burger_frontend
npm install axios
```

`.env.local` (already git-ignored by `*.local`):

```bash
VITE_API_URL=http://localhost:8000/api/v1
```

Backend `.env`:

```bash
FRONTEND_URL=http://localhost:5173        # CORS + PayHere return pages
```

CORS allows only `FRONTEND_URL` (plus `CORS_ALLOWED_ORIGINS`). It allows the `Authorization`, `Content-Type`, `X-Cart-Token` and `Idempotency-Key` headers and exposes `X-Cart-Token`.

**Currency:** the storefront formats prices as USD (`SITE.currency = 'USD'`, `locale = 'en-US'` in `src/data/site.ts`). The API returns LKR. Prices are already in cents, so `formatPrice()` keeps working; only the currency needs to change:

```ts
// src/data/site.ts
locale: 'en-LK',
currency: 'LKR',
```

## 2. Data model mapping

The API keeps the storefront's identifiers:

| Storefront (`src/data/products.ts`) | API `Product` | Notes |
| --- | --- | --- |
| `id` (`'theory-classic'`) | `slug` | `/products/theory-classic` works; the numeric `id` also works. |
| `price` (cents) | `price` (cents) | Same convention. |
| `image`, `imageAlt` | `image.url`, `image.alt` | Seeded URLs are the storefront's own `/images/products/*.svg`. |
| `categories: ('beef'\|'chicken'\|'spicy'\|'plant')[]` | `categories[].slug` | Same slugs; a product can have several. |
| `badge` | `badge` | Same strings. |
| `CATEGORIES` | `GET /categories` | |

`toStorefrontProduct(apiProduct)` in `api-client.ts` returns exactly the existing `Product` shape. To load the menu from the API without touching any component, swap the source of `PRODUCTS`:

```ts
const page = await menu.products({ per_page: 50 })
const products = page.data.map(toStorefrontProduct)
```

## 3. Authentication

- `auth.register()` and `auth.login()` store the Sanctum token (`localStorage['burger-theory:auth-token']`). They also merge any guest cart into the account (`POST /cart/merge`).
- Every request then carries `Authorization: Bearer <token>`. On a 401 the client drops the token and carries on as a guest.
- `auth.logout()` revokes the token on the server and forgets it.

There is no existing auth in the storefront to reconcile. This client is the single place that holds tokens, so don't add a second token store elsewhere.

## 4. Cart

The server cart is the source of truth for totals. Guests get a cart token on their first `POST /cart/items`; the client saves it from the `X-Cart-Token` response header and sends it back automatically.

Two ways to integrate, from least to most change:

**A. Keep the local cart and sync at checkout (smallest change).** `CartContext` stays as it is. When the customer presses Checkout:

```ts
const serverCart = await cart.syncFromLocal(items.map((i) => ({ productId: i.productId, quantity: i.quantity })))
if (!serverCart.can_checkout) show(serverCart.issues) // sold out, below minimum, closed…
```

**B. Server cart everywhere (recommended later).** `add`, `setQuantity` and `remove` in `CartProvider` call `cart.add`, `cart.setQuantity` and `cart.remove`, and the provider keeps the returned `Cart`. Stock problems show up immediately (`insufficient_stock`, `quantity_limit`).

Totals come from the server: `subtotal`, `discount_total`, `delivery_fee` and `total`. `GET /cart?fulfilment_type=pickup` prices pickup (no delivery fee). The existing "Taxes, delivery and tips are added at checkout" copy still fits.

## 5. Checkout

`src/services/orders.ts` is the planned integration point. A drop-in replacement for `submitOrder` keeps the storefront's `OrderResult` contract:

```ts
import { ApiError, auth, cart, orders, payments } from './api/client'

export async function submitOrder(order: OrderRequest): Promise<OrderResult> {
  if (!auth.isSignedIn()) return { status: 'unavailable', message: 'Please sign in to place an order.' }
  try {
    await cart.syncFromLocal(order.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })))
    const { data: placed } = await orders.place({ fulfilment_type: 'pickup', payment_method: 'cod' })
    return { status: 'accepted', orderId: placed.order_number }
  } catch (e) {
    return { status: 'unavailable', message: e instanceof ApiError ? e.message : 'Ordering is unavailable right now.' }
  }
}
```

The backend ignores the `unitPrice` and `subtotal` the storefront currently sends, and prices from the database instead.

A fuller checkout collects `fulfilment_type`, an address (`address_id`, or an inline `address`) and `payment_method`. Use one `Idempotency-Key` per checkout attempt: `orders.place(payload, key)`. Reuse the same key when retrying after a network error, so a retry can never create a second order.

### PayHere flow

```
orders.place({ payment_method: 'payhere', … })     → order (payment_status: pending), meta.next_action = 'payhere_checkout'
payments.startPayHere(order.order_number)            → { action_url, fields }   (hash signed by the server)
payments.redirectToPayHere(checkout)                 → browser goes to PayHere
… shopper pays …
PayHere → POST /payments/payhere/notify (server)     → payment verified and order marked paid
PayHere → browser to PAYHERE_RETURN_URL?order=BT-…   → storefront page
orders.waitForPayment(orderNumber)                   → order with payment_status 'paid' | 'failed' | 'cancelled'
```

The return URL tells you nothing about the payment (PayHere sends no status there). Always ask the API. If the payment failed or was cancelled, `order.can_pay_online` stays `true` and calling `startPayHere` again opens a new attempt.

The storefront is a single page without a router. Point the return pages at it with a query flag:

```bash
# backend .env
PAYHERE_RETURN_URL=http://localhost:5173/?checkout=complete
PAYHERE_CANCEL_URL=http://localhost:5173/?checkout=cancelled
```

On load, read `checkout` and `order` from `location.search` and show the result, e.g. in the cart drawer's notice area.

### Cash on delivery

`orders.place({ payment_method: 'cod', … })` completes the order. `payment_status` stays `pending` until staff record the cash.

## 6. Order tracking

`orders.get(number)` returns `status`, `status_label` and a `timeline` of `{ status, label, note, at }`. `orders.list()` gives the history. Poll every 20–30 s on a tracking screen. `GET /notifications` also lists status changes.

---

## Response examples

Captured from the running API (dev database).

### Product — `GET /products/theory-classic`

```json
{
  "data": {
    "id": 1,
    "slug": "theory-classic",
    "name": "The Theory Classic",
    "description": "Double smashed beef, aged cheddar, fresh lettuce, vine tomato, signature sauce and our toasted brioche bun.",
    "price": 145000,
    "compare_at_price": null,
    "currency": "LKR",
    "badge": "Signature",
    "is_featured": true,
    "is_available": true,
    "in_stock": true,
    "stock_status": "in_stock",
    "max_quantity": 20,
    "image": { "url": "/images/products/theory-classic.svg", "alt": "Double cheeseburger with lettuce and tomato on a sesame brioche bun" },
    "images": [{ "id": 1, "url": "/images/products/theory-classic.svg", "alt": "Double cheeseburger with lettuce and tomato on a sesame brioche bun", "width": 1000, "height": 1000, "is_primary": true }],
    "categories": [{ "id": 1, "slug": "beef", "name": "Beef" }],
    "rating": { "average": null, "count": 0 }
  }
}
```

### Cart — `POST /cart/coupon {"code":"WELCOME10"}`

```json
{
  "data": {
    "token": null,
    "currency": "LKR",
    "fulfilment_type": "delivery",
    "items": [{
      "id": 15,
      "product": { "id": 1, "slug": "theory-classic", "name": "The Theory Classic", "image": { "url": "/images/products/theory-classic.svg", "alt": "…" }, "max_quantity": 20 },
      "quantity": 2, "unit_price": 145000, "line_total": 290000, "issue": null
    }],
    "item_count": 2,
    "coupon": { "code": "WELCOME10", "description": "10% off your first order (max LKR 500)", "is_valid": true, "error": null },
    "subtotal": 290000,
    "discount_total": 29000,
    "delivery_fee": 35000,
    "total": 296000,
    "minimum_order_amount": 100000,
    "free_delivery_threshold": 500000,
    "can_checkout": true,
    "issues": []
  }
}
```

### Order — `POST /orders` (201)

```json
{
  "data": {
    "order_number": "BT-261122-Y2AULD",
    "status": "pending",
    "status_label": "Pending",
    "payment_method": "payhere",
    "payment_status": "pending",
    "fulfilment_type": "delivery",
    "currency": "LKR",
    "subtotal": 290000, "discount_total": 29000, "delivery_fee": 35000, "total": 296000,
    "coupon_code": "WELCOME10",
    "customer": { "name": "Nimali Perera", "email": "nimali@example.com", "phone": "0771234567" },
    "delivery_address": { "recipient_name": "Nimali Perera", "phone": "0771234567", "line1": "12 Galle Road", "line2": null, "city": "Colombo 03", "postal_code": null, "delivery_instructions": null },
    "notes": null,
    "items": [{ "product_id": 1, "product_slug": "theory-classic", "name": "The Theory Classic", "unit_price": 145000, "quantity": 2, "line_total": 290000 }],
    "item_count": 2,
    "payment": { "reference": "BT-261122-Y2AULD-1", "method": "payhere", "status": "pending", "amount": 296000, "currency": "LKR", "provider_method": null, "card_mask": null, "status_message": null, "paid_at": null, "collected_at": null, "created_at": "2026-11-22T05:41:33+00:00", "updated_at": "2026-11-22T05:41:33+00:00" },
    "timeline": [{ "status": "pending", "label": "Pending", "note": "Order placed", "at": "2026-11-22T05:41:33+00:00" }],
    "can_cancel": true,
    "can_pay_online": true,
    "cancellation_reason": null,
    "estimated_ready_at": "2026-11-22T06:06:33+00:00",
    "paid_at": null, "delivered_at": null, "cancelled_at": null,
    "created_at": "2026-11-22T05:41:33+00:00",
    "updated_at": "2026-11-22T05:41:33+00:00"
  },
  "meta": { "created": true, "next_action": "payhere_checkout" }
}
```

### PayHere checkout — `POST /payments/payhere`

```json
{
  "data": {
    "payment": { "reference": "BT-261122-Y2AULD-1", "method": "payhere", "status": "pending", "amount": 296000, "currency": "LKR", "…": "…" },
    "action_url": "https://sandbox.payhere.lk/pay/checkout",
    "method": "POST",
    "sandbox": true,
    "fields": {
      "merchant_id": "1211149",
      "return_url": "http://localhost:5173/checkout/complete?order=BT-261122-Y2AULD",
      "cancel_url": "http://localhost:5173/checkout/cancelled?order=BT-261122-Y2AULD",
      "notify_url": "https://<public-api>/api/v1/payments/payhere/notify",
      "order_id": "BT-261122-Y2AULD-1",
      "items": "Burger Theory order BT-261122-Y2AULD",
      "currency": "LKR",
      "amount": "2960.00",
      "first_name": "Nimali",
      "last_name": "Perera",
      "email": "nimali@example.com",
      "phone": "0771234567",
      "address": "12 Galle Road",
      "city": "Colombo 03",
      "country": "Sri Lanka",
      "custom_1": "BT-261122-Y2AULD",
      "hash": "845120452A784B51572B0A108D9393CD",
      "delivery_address": "12 Galle Road",
      "delivery_city": "Colombo 03",
      "delivery_country": "Sri Lanka"
    }
  }
}
```

### Errors

```jsonc
// 422 validation
{ "message": "The quantity field must be at least 1.", "errors": { "quantity": ["The quantity field must be at least 1."] } }

// 422 business rule
{ "message": "The Ultimate Stack is sold out.", "code": "insufficient_stock", "details": { "product_id": 6, "available": 0 } }

// 409 state conflict
{ "message": "This order can no longer be cancelled online. Please call the restaurant.", "code": "order_not_cancellable" }

// 404 (also for other customers' orders)
{ "message": "Not found.", "code": "not_found" }

// 401
{ "message": "Unauthenticated." }
```

`ApiError` in the client normalises all of these into `{ status, code, message, fieldErrors, details }`.
