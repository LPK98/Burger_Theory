# Burger Theory API v1 — endpoint reference

Base URL: `http://localhost:8000/api/v1` (production: `https://<api-domain>/api/v1`).

Machine-readable spec: [openapi.json](openapi.json). With `APP_ENV=local`, browse it at `/docs/api`.

## Conventions

| | |
| --- | --- |
| Auth | `Authorization: Bearer <token>` from `/register` or `/login` (Laravel Sanctum). |
| Guest cart | `X-Cart-Token: <uuid>`, returned in `data.token` and the `X-Cart-Token` response header on the first cart write. |
| Money | Integer cents of LKR: `145000` = LKR 1,450.00. Never send prices; the server ignores them. |
| Requests | JSON (`Content-Type: application/json`), except image upload (multipart) and the PayHere callback (form-encoded). |
| Responses | `{ "data": … }`; lists add `links` and `meta` (pagination: `?page=`, `?per_page=`). |
| Validation errors | `422 { "message", "errors": { field: [messages] } }` |
| Business errors | `{ "message", "code", "details"? }` with 403, 404, 409, 422 or 503. Codes are listed in [frontend-integration/api-types.ts](frontend-integration/api-types.ts). |
| Rate limits | 429 when exceeded: auth 5/min per email+IP, checkout 10/min per user, API 120/min. |

Auth column: **public** = no token; **optional** = guest or customer; **customer** = any signed-in user; **admin** = `role: admin`.

## Authentication & profile

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/register` | public | Create a customer account → `{ user, token }` (201). `role` cannot be set. |
| POST | `/login` | public | → `{ user, token }`. Wrong credentials → 422 on `email`. |
| POST | `/logout` | customer | Revoke the current token (204). |
| GET | `/user` | customer | The signed-in user. |
| PUT/PATCH | `/user` | customer | Update `name`, `email`, `phone`. |
| PUT | `/user/password` | customer | `current_password`, `password`, `password_confirmation`. Revokes other tokens. |

## Menu

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/restaurant` | public | Ordering settings: delivery fee, free-delivery threshold, minimum order, open switches, available payment methods. |
| GET | `/opening-hours` | public | Opening hours and live status, computed in Asia/Colombo time: `status` (`state` open / closed / temporarily_closed, `closes_at`, `closing_soon`, `next_opening`, `reason`), `weekly` (Monday first), `week` (next 7 days with special dates applied), upcoming `special_dates`, `announcement`. Times are `HH:MM`; a close earlier than the open (`overnight`) ends after midnight; `23:59` means midnight. `Cache-Control: max-age=30`. |
| GET | `/categories` | public | Active categories with `products_count`. |
| GET | `/categories/{id\|slug}` | public | One category. |
| GET | `/products` | public | Menu. Filters: `search`, `category` (slug), `featured`, `on_sale`, `in_stock`, `min_price`, `max_price` (cents), `sort` = `menu`·`price`·`-price`·`name`·`-name`·`newest`·`rating`, `per_page` ≤ 50. |
| GET | `/products/{id\|slug}` | public | One product, e.g. `/products/theory-classic`. Includes `addons`: the extras this burger accepts (`id`, `name`, `kind`, `price`, `max_quantity` per burger). |
| GET | `/products/{id\|slug}/reviews` | public | Published reviews. |
| GET | `/offers` | public | Current public coupon codes. |
| GET | `/addons?kind=topping\|sauce\|side\|extra` | public | Every add-on that is switched on. Which burgers accept which add-on is in each product's `addons`. |

## Cart

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/cart?fulfilment_type=delivery\|pickup` | optional | Cart with server totals, `issues` and `can_checkout`. |
| POST | `/cart/items` | optional | `{ product_slug \| product_id, quantity, addons?: [{ addon_id, quantity? }] }`. Add-on quantity is per burger (default 1, up to the product's `max_quantity`). Adds to the existing line with the same add-ons; a different combination is a new line (201). |
| PATCH/PUT | `/cart/items/{lineId}` | optional | `{ quantity }`. 0 removes the line; negative values are rejected. |
| DELETE | `/cart/items/{lineId}` | optional | Remove a line. |
| DELETE | `/cart` | optional | Empty the cart and drop the coupon. |
| POST | `/cart/coupon` | optional | `{ code }`, validated now and again at checkout. |
| DELETE | `/cart/coupon` | optional | Remove the coupon. |
| POST | `/cart/merge` | customer | `{ cart_token }`: move a guest cart into the account after login. |

Stock, availability and the 20-per-line limit are enforced on every write (`insufficient_stock`, `product_unavailable`, `quantity_limit`). Stock covers every line of the same product. Add-ons must be switched on, offered by that product and within its maximum (`addon_unavailable`, `addon_quantity_limit`).

Each cart line has `unit_price` (one burger as configured), `base_price` (the product alone), `addons: [{ id, slug, name, quantity, unit_price }]` and `line_total = unit_price × quantity`. If an add-on is switched off or removed from the product after it was added, the line gets `issue: "addon_unavailable"` and checkout is blocked until the line is removed and re-added. Order items carry the same breakdown (`base_unit_price`, `addons_unit_price`, `addons`) as a snapshot.

## Addresses

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/addresses` | customer | Your saved addresses (default first). |
| POST | `/addresses` | customer | `recipient_name`, `phone`, `line1`, `line2?`, `city`, `postal_code?`, `delivery_instructions?`, `label?`, `is_default?` |
| GET/PATCH/DELETE | `/addresses/{id}` | customer | Your address only (others answer 404). |

## Orders

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/orders` | customer | Checkout from your cart. Body: `fulfilment_type`, `payment_method` (`payhere`\|`cod`), `address_id` or `address` (delivery), `contact_phone?`, `notes?`, `save_address?`. Header `Idempotency-Key` recommended. 201 when new, 200 when the key matched an earlier order. `meta.next_action = "payhere_checkout"` for PayHere. |
| GET | `/orders` | customer | Your orders, newest first. `?status=`, `?active=1`. |
| GET | `/orders/{orderNumber}` | customer | Order details and `timeline` (order tracking). |
| POST | `/orders/{orderNumber}/cancel` | customer | `{ reason? }`. Only `pending` and unpaid, otherwise 409 `order_not_cancellable`. |

## Payments

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/payments/payhere` | customer | `{ order_number }` → `{ action_url, method, sandbox, fields, payment }`. POST `fields` to `action_url`. |
| POST | `/payments/payhere/notify` | PayHere (signature) | Server-to-server callback, form-encoded. 200 `OK` / 400 `REJECTED`. |
| GET | `/payments/{reference}` | customer | Payment status, e.g. `/payments/BT-261122-Y2AULD-1`. |

## Notifications

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/notifications?unread=1` | customer | In-app notifications, plus `meta.unread_count`. |
| POST | `/notifications/{id}/read` | customer | Mark one read. |
| POST | `/notifications/read-all` | customer | Mark all read. |

## Reviews

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/products/{id\|slug}/reviews` | customer | `{ rating 1–5, title?, body? }`. Requires a delivered order containing the product; one review each. |
| PATCH | `/reviews/{id}` | customer | Edit your review. |
| DELETE | `/reviews/{id}` | customer | Delete your review. |

## Admin (`role: admin`)

Administrators sign in with `POST /admin/login` (`email`, `password`). It issues a token **only** to administrators; a customer account gets the same 422 as a wrong password, and no token. There is no admin registration endpoint: create the first administrator with `php artisan app:create-admin` (or `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` when seeding); after that an administrator can promote an existing account with `PATCH /admin/users/{id}`. `GET /user` returns the signed-in account's `role`; `POST /logout` ends the session. Suspended accounts can't sign in and their tokens answer 401.

Every successful admin write (POST/PUT/PATCH/DELETE) and every admin sign-in is recorded in the activity log, with passwords, tokens and secrets redacted.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/admin/login` | Admin-only sign-in (throttled like `/login`). |
| GET | `/admin/dashboard` | Revenue (total and today), paid/total/pending/active/completed/cancelled orders, orders by status, unpaid COD, refunds required, customers (and new today), product availability, best sellers, recent orders, low-stock products, `low_stock_ingredients`, `recent_activity` (sign-ups, orders placed, customer cancellations). |
| GET | `/admin/dashboard/sales?interval=day\|week\|month&from=YYYY-MM-DD&to=YYYY-MM-DD` | Series in the restaurant timezone (default: last 30 days, 12 weeks or 12 months). Per period: paid `orders`, `revenue`, `discounts` (by payment date) and `placed`, `cancelled` (by order date). Weeks start on Monday. Also at `/admin/reports/sales`. |
| GET | `/admin/dashboard/best-sellers?from=&to=&limit=` | Top products by quantity (paid orders; `limit` 1–50, default 20). Also at `/admin/reports/best-sellers`. |
| GET | `/admin/reports/orders?from=&to=` | Order statistics for orders placed in the range (default last 30 days): counts by status, fulfilment and payment method, revenue, discounts, delivery fees, average order value, cancellation rate, orders per hour of day. |
| GET | `/admin/customers` | Customers with `orders_count`, `total_spent` (paid, not voided), `last_order_at`. `search` (name/email/phone), `has_orders`, `sort` (newest, oldest, name, orders, spent, last_order). Never includes passwords or tokens. |
| GET | `/admin/customers/{id}` | One customer: the above plus completed/cancelled/paid orders, average order value, favourite products and saved addresses. Their orders: `/admin/orders?customer_id={id}`. |
| GET | `/admin/payments` | Payment attempts: `method`, `status`, `date_from`, `date_to`, `search` (reference, PayHere id, order number, customer). `meta.summary` totals the filtered set. |
| GET | `/admin/payments/{reference}` | A payment with its order and the PayHere notifications received (signature check and outcome; raw payloads are not exposed). |
| GET/POST | `/admin/ingredients` | Kitchen ingredients with `stock_status`, `used_last_7_days` and `days_of_cover` (`search`, `status`, `sort=name\|urgency`) / create (`name`, `unit`: g/kg/ml/l/pcs, `stock_quantity?` opening stock, `min_stock_level?`, `notes?`). |
| GET/PATCH/DELETE | `/admin/ingredients/{id}` | Show (with the products that use it) / rename, minimum level, notes (the unit is fixed) / remove (leaves every recipe; history kept). |
| POST | `/admin/ingredients/{id}/adjustments` | `{ reason: restock\|adjustment\|waste, change: ±n \| set_to: n, note? }`. Manual changes never take stock below zero. |
| GET | `/admin/ingredients/{id}/movements` | That ingredient's stock history. |
| GET | `/admin/inventory/movements` | All ingredient movements: `ingredient_id`, `reason`, `date_from`, `date_to`. |
| GET | `/admin/inventory/consumption?from=&to=` | Per ingredient: used by orders (net of returns), restocked, wasted and adjusted in the period. |
| PUT | `/admin/products/{id}/recipe` | `{ items: [{ ingredient_id, quantity }] }` replaces the recipe. Each placed order consumes `quantity × units sold`; a cancelled or rejected order returns it. Ingredients never block an order: a count can go below zero, which the dashboard reports. |
| GET | `/admin/products` | All products: `search`, `category`, `is_available`, `stock_status`, `with_trashed`. |
| POST | `/admin/products` | `name`, `price` (cents), `category_ids[]`, `slug?`, `description?`, `compare_at_price?`, `badge?`, `is_available?`, `is_featured?`, `track_stock?`, `stock_quantity?` (opening stock), `low_stock_threshold?`, `sort_order?`. |
| GET/PUT/PATCH/DELETE | `/admin/products/{id}` | Show, update (price, availability, categories…; not stock), soft-delete. |
| POST | `/admin/products/{id}/restore` | Undelete. |
| POST | `/admin/products/{id}/images` | Multipart `image` (jpg/png/webp ≤ 5 MB), `alt_text?`, `is_primary?` → Cloudinary. |
| PATCH/DELETE | `/admin/products/{id}/images/{imageId}` | Alt text, order, make primary; delete (also removed from Cloudinary). |
| GET | `/admin/products/{id}/stock` | Stock movement log. |
| POST | `/admin/products/{id}/stock` | `{ change: ±n \| set_to: n, reason: restock\|adjustment, note? }` (logged). |
| PUT | `/admin/products/{id}/addons` | `{ addons: [{ addon_id, max_quantity?, sort_order? }] }` replaces the add-ons the product offers (empty list = none). |
| GET/POST | `/admin/categories` | List (including inactive) / create. |
| PUT/PATCH/DELETE | `/admin/categories/{id}` | Update / soft-delete. |
| GET/POST | `/admin/addons` | All add-ons with `products_count` (`search`, `kind`, `is_available`, `with_trashed`) / create (`name`, `price` cents, `kind?` topping·sauce·side·extra, `slug?`, `description?`, `is_available?`, `sort_order?`). |
| GET/PUT/PATCH/DELETE | `/admin/addons/{id\|slug}` | Show (with the products that offer it) / update (a new price applies to carts immediately; placed orders keep theirs) / soft-delete. |
| GET | `/admin/users` | Every account, customers and administrators: `search`, `role`, `status=active\|suspended`, `sort=newest\|oldest\|name`. |
| GET | `/admin/users/{id}` | One account with `orders_count` and `addresses_count`. |
| PATCH | `/admin/users/{id}` | `name?`, `phone?`, `role?` (customer\|admin), `suspended?`, `suspension_reason?`. Suspending or demoting revokes the account's tokens. You can't change your own role or suspend yourself (422 `cannot_modify_self`), so at least one administrator always remains. |
| GET | `/admin/activity-logs` | Audit trail, newest first: `user_id`, `action` (prefix, e.g. `admin.products`), `subject_type`, `subject_id`, `from`, `to` (restaurant-local dates), `per_page` ≤ 100. Each entry: who, `action` (route name), method, path, subject, status code, redacted `properties.input`, IP, user agent, time. |
| GET | `/admin/orders` | Filters: `status` (comma list), `payment_status`, `payment_method`, `fulfilment_type`, `date_from`, `date_to` (restaurant-local dates), `search` (number/name/email/phone), `sort`. |
| GET | `/admin/orders/{orderNumber}` | Full order with every payment attempt and the status history. |
| PUT/PATCH | `/admin/orders/{orderNumber}/status` | `{ status, note? }`. `note` is required for `rejected`/`cancelled`. Invalid moves → 409 with `details.allowed`. |
| POST | `/admin/orders/{orderNumber}/cod-collection` | Record cash collected (COD; ready/out for delivery/delivered). |
| GET/POST | `/admin/coupons` | List / create (`code`, `discount_type`, `percentage` or `amount`, limits, window, `is_public`). |
| GET/PUT/PATCH/DELETE | `/admin/coupons/{id}` | Show / update / soft-delete. |
| GET | `/admin/reviews` | `product_id`, `is_published`. |
| PATCH/DELETE | `/admin/reviews/{id}` | `{ is_published }` / delete. |
| GET/PUT/PATCH | `/admin/settings` | Ordering (delivery fee, free-delivery threshold, minimum order, prep minutes, on/off switches) and the restaurant profile: `restaurant_name`, `contact_phone`, `contact_email`, `address_line1`, `address_line2`, `city`, `postal_code`, `instagram_url`, `facebook_url` (https links on instagram.com / facebook.com; null hides the icon). `maps_url`: Google Maps link (maps.app.goo.gl, goo.gl/maps or google.com/maps) opened by the website's Find us card; defaults to RESTAURANT_MAPS_URL / the restaurant's shared link, null makes the card a plain card. `maps_embed_url`: the src of Google Maps' "Embed a map" iframe (https://www.google.com/maps/embed?pb=…), shown in the Find us card; null shows the drawn street map. Opening hours moved to `/admin/opening-hours` (an `opening_hours` field sent here is ignored). `meta.integrations` says whether Cloudinary and PayHere are configured. |
| POST/DELETE | `/admin/settings/logo` | Multipart `logo` (jpg/png/webp ≤ 2 MB) → Cloudinary, replacing the old one / remove it. |
| GET | `/admin/opening-hours` | Weekly hours, `temporarily_closed`, `announcement`, live `status`, and every special date (upcoming first, then up to 50 past). |
| PUT/PATCH | `/admin/opening-hours` | Any of `weekly` (seven `{day, closed, open: "HH:MM", close: "HH:MM"}`), `temporarily_closed` (bool), `announcement` (≤ 500 chars, null/"" clears). |
| GET/POST | `/admin/opening-hours/special-dates` | List / add `{starts_on, ends_on?, closed, open?, close?, title, note?}` (`YYYY-MM-DD`; `ends_on` defaults to `starts_on`; ranges may not overlap, may not lie wholly in the past, ≤ 366 days). |
| GET/PUT/PATCH/DELETE | `/admin/opening-hours/special-dates/{id}` | Show / update / delete. |

`GET /restaurant` (public) now also returns `profile`: name, phone, email, address, opening hours (the weekly table), `social` ({instagram, facebook}), `maps_url`, `maps_embed_url` and logo URL. The storefront reads its contact section, footer, Find us card, mobile menu and cart phone number from it.

Coupon `starts_at` / `expires_at` may carry an offset (`2026-12-31T23:59:00+05:30`); a time without one is read in the restaurant timezone. Both are stored in UTC.

Customers calling `/admin/*` get `403 { "code": "forbidden" }`.
