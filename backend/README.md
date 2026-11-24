# Burger Theory API

The ordering backend for the Burger Theory storefront (`../Burger_frontend`): menu, cart, checkout, Stripe, PayHere and cash-on-delivery payments, order tracking, and admin management.

Laravel 13 · PHP 8.3+ (developed on 8.5) · PostgreSQL 18 · Sanctum tokens · REST under `/api/v1`.

- Endpoint reference: [docs/API.md](docs/API.md)
- Database schema, migrations, seeding and pgAdmin guide: [docs/DATABASE.md](docs/DATABASE.md), with ready-made queries in [docs/pgadmin-queries.sql](docs/pgadmin-queries.sql)
- Frontend integration guide, types and Axios client: [docs/FRONTEND_INTEGRATION.md](docs/FRONTEND_INTEGRATION.md)
- OpenAPI 3.1: [docs/openapi.json](docs/openapi.json). Interactive docs are at `http://localhost:8000/docs/api` while `APP_ENV=local`.

---

## Quick start

Prerequisites: PHP 8.3+ with `pdo_pgsql`, Composer, and PostgreSQL. Laravel Herd provides PHP and Composer on this machine; PostgreSQL 18 runs as the `postgresql-x64-18` Windows service.

```bash
cd backend
composer install
cp .env.example .env          # then set DB_PASSWORD (and PayHere/Cloudinary when you have them)
php artisan key:generate

# Create the databases (one for the app, one that the test suite rebuilds)
createdb -U postgres burger_theory
createdb -U postgres burger_theory_test

php artisan migrate
php artisan db:seed           # settings, the 9 storefront burgers, ingredients, add-ons, demo coupons (non-production)
                              # + an administrator if SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD are set in .env
php artisan app:create-admin  # or create one interactively (prompts for name, email and password)

php artisan serve             # http://localhost:8000
php artisan queue:work        # second terminal: sends order notifications
php artisan schedule:work     # third terminal: expires unpaid online orders, prunes guest carts
```

Check it works: `curl http://localhost:8000/api/v1/products`.

### Tests

```bash
php artisan test     # 156 tests, run against PostgreSQL database burger_theory_test (wiped each run)
vendor/bin/pint      # code style
```

The tests use the host, port, user and password from `.env`, and the database `burger_theory_test` from `phpunit.xml`. `tests/TestCase.php` refuses to run against any database whose name does not end in `_test`, because `RefreshDatabase` drops every table.

---

## Architecture

A modular monolith. Controllers are thin: they validate (Form Requests), authorise (Policies), call one service, and shape the output (API Resources).

```
app/
├── Enums/                 OrderStatus (with the transition graph), PaymentStatus, PaymentMethod, …
├── Casts/MoneyCast.php    NUMERIC(10,2) column ⇄ integer cents
├── Support/Money.php      exact money parsing, formatting and percentages (no floats)
├── Exceptions/            ApiException + Cart/Coupon/Order/Payment/ImageStorage exceptions → JSON {message, code, details}
├── Http/
│   ├── Controllers/Api/V1/          public + customer endpoints
│   ├── Controllers/Api/V1/Admin/    admin endpoints
│   ├── Middleware/                  admin gate, optional auth for the cart, JSON + security headers
│   ├── Requests/                    validation for every input
│   └── Resources/                   response shapes (no secrets or hashes, ever)
├── Models/                Eloquent models and relationships
├── Notifications/         queued mail and database notifications
├── Policies/              ownership rules (other customers' data answers 404)
└── Services/
    ├── Cart/              CartResolver (guest token vs account), CartService, PricingService (the single source of totals)
    ├── Coupon/            rules, discount maths, usage accounting
    ├── Order/             OrderPlacementService (checkout transaction), OrderWorkflowService (status changes), notifier
    ├── Payment/           PayHere (config, signatures, checkout, notification handler) and CashOnDeliveryService
    ├── Product/           ProductService, InventoryService (every stock movement is logged), images (Cloudinary)
    ├── Settings/          RestaurantSettings (delivery fee, minimum order, on/off switches)
    └── Dashboard/         revenue, counts, best sellers, daily and monthly sales
```

### Money

The restaurant trades in **USD** (`config/restaurant.php` → `currency`). Columns are `NUMERIC(10,2)` dollars. In PHP and in every API payload, money is an integer number of cents, so `1450` means $14.50. (Until 2026-11-26 the API used LKR; migration `2026_11_26_100100_switch_currency_to_usd` re-priced the catalogue to match the storefront menu, dividing stored amounts by 100, and refuses to run while LKR orders exist.) This is the same convention the storefront already uses for `Product.price`. Prices and totals are always calculated on the server from the `products` table. A client cannot send a price that the API will use.

### Database

PostgreSQL with foreign keys, CHECK constraints and partial unique indexes doing real work:

| Guarantee | Enforced by |
| --- | --- |
| An order total equals subtotal − discount + delivery fee | `orders_amounts_check` |
| An order line total equals unit price × quantity | `order_items_line_total_check` |
| Stock never goes negative | `products_stock_quantity_check`, `inventory_logs_change_check` |
| An order is never paid twice | `payments_one_paid_per_order` (unique index where `status = 'paid'`) |
| A PayHere `payment_id` / Stripe PaymentIntent is recorded once; a Stripe Checkout Session belongs to one payment | `payments_method_provider_payment_id_unique`, `payments_provider_checkout_id_unique` |
| One cart per customer, one default address, one primary image per product, one review per customer and product | unique and partial unique indexes |
| Roles, statuses, methods and coupon types only take known values | CHECK constraints |

Tables: users, personal_access_tokens, categories, products, category_product, product_images, addons, addon_product, addresses, carts, cart_items, cart_item_addons, coupons, coupon_usages, orders, order_items, order_item_addons, order_status_histories, payments, payment_events, reviews, restaurant_settings, inventory_logs, ingredients, ingredient_movements, ingredient_product, admin_activity_logs, notifications, plus Laravel's jobs, cache and sessions tables. Column-level detail is in [docs/DATABASE.md](docs/DATABASE.md).

**Add-ons.** A product offers add-ons through `addon_product` (with a per-burger `max_quantity`). A cart line is product + add-on combination (`cart_items.options_key`), so the same burger with different extras is a separate line. A line's unit price is product price + Σ(add-on price × quantity), always from the database. At checkout the add-ons are re-validated with the products locked and snapshotted into `order_item_addons`, and `order_items.unit_price` includes them (`addons_unit_price` is that part), so `line_total = unit_price × quantity` still holds. Add-ons don't have their own stock and don't consume ingredients.

**Activity log.** The `admin.activity` middleware writes every successful admin write to `admin_activity_logs`: who, route name, subject, status, the submitted fields with passwords, tokens and secrets redacted, IP and user agent. Admin sign-ins are logged too.

**Two kinds of stock.** `products.stock_quantity` (with `inventory_logs`) caps how many of a burger can be sold and blocks checkout when it runs out. `ingredients.stock_quantity` (NUMERIC(12,3), with `ingredient_movements`) is the kitchen's raw-material count. Placed orders consume it through each product's recipe (`ingredient_product`), and cancelled or rejected orders return it, in the same transaction as the order. It never blocks an order: a count below zero means the records and the walk-in disagree, and the admin portal flags it. Manual restocks, stock counts and waste are logged and can't go below zero.

Order items keep a snapshot of the product name, slug, unit price and quantity. Orders keep the customer's name, email and phone and the delivery address as they were at checkout. Products, categories, coupons, addresses, reviews and users are soft-deleted. Orders and payments are never deleted.

### Checkout (one transaction)

`OrderPlacementService::place()`:

1. Lock the customer's cart row. This serialises double clicks and retries.
2. If the `Idempotency-Key` matches an earlier order, return that order.
3. Lock the products (`SELECT … FOR UPDATE`, in id order to avoid deadlocks), then re-check availability and stock.
4. Price every line from the database, then apply the minimum order, the coupon (row locked, all limits re-checked) and the delivery fee.
5. Snapshot the items and the address, take stock (logged), and record coupon usage.
6. Create the pending payment and the first status-history entry, then empty the cart.
7. After commit, queue notifications to the customer and to administrators.

I ran a race against the dev database. Two separate PHP processes bought the last unit of a product at the same instant: one got the order, the other got `insufficient_stock`, and stock ended at 0.

### Order lifecycle

```
pending → confirmed → preparing → ready → out_for_delivery → delivered    (delivery)
pending → confirmed → preparing → ready → delivered                       (pickup; "delivered" = collected)
pending → rejected          any state before delivered → cancelled
```

- Customers can cancel only while an order is `pending` and unpaid.
- An online (Stripe or PayHere) order cannot be confirmed until its payment is verified.
- Cancelling or rejecting an order returns its stock and its coupon use, and voids pending payments. If the order was already paid, the payment is marked `refund_required` (refunds are issued from the Stripe Dashboard or the PayHere merchant portal). Cancelling a Stripe order also expires its open Checkout Session.
- Online orders still unpaid after `ORDER_UNPAID_EXPIRY_MINUTES` (default 60) are cancelled by the scheduler, and their stock is released.

### Payments

**Stripe** ([Checkout Sessions](https://docs.stripe.com/payments/checkout), hosted page; card data never reaches this server):

1. `POST /api/v1/payments/stripe {order_number}` creates a Checkout Session for the server-priced total (one line item, `client_reference_id` = payment reference, order number in `metadata`) and returns its `url`. The idempotency key is built from the payment reference and the planned expiry stored on the row, so retries and concurrent clicks get the same session. While a session is open it is reused; an expired one opens a new attempt (`BT-…-2`).
2. The browser goes to Stripe. Stripe sends it back to `STRIPE_SUCCESS_URL` / `STRIPE_CANCEL_URL` with `?order=<number>`; that redirect proves nothing.
3. `POST /api/v1/payments/stripe/webhook` verifies the `Stripe-Signature` header against `STRIPE_WEBHOOK_SECRET` (400 if it fails, 503 if the secret is not set) and handles `checkout.session.completed`, `checkout.session.async_payment_succeeded` / `_failed`, `checkout.session.expired` and `charge.dispute.created` (→ `charged_back`). A session only settles the payment whose stored session id it matches, and only if `amount_total` and `currency` equal what was requested. Re-delivered events (same `evt_` id) are skipped.
4. `POST /api/v1/payments/stripe/confirm {order_number}` (return page) retrieves the order's latest session from Stripe by its stored id and applies it through the same code path, so the order updates even before the webhook (and in local development without one).
5. Both paths use `PaymentSettlement`, the state machine shared with PayHere, and log to `payment_events` (a summary, never the raw body).

**PayHere** ([Checkout API](https://support.payhere.lk/api-&-mobile-sdk/checkout-api)):

1. `POST /api/v1/payments/payhere {order_number}` returns the sandbox or live form URL and the fields. The server computes `hash = UPPER(md5(merchant_id + order_id + amount + currency + UPPER(md5(secret))))`, and the merchant secret never leaves the server.
2. The browser posts the fields to PayHere.
3. PayHere posts a form-encoded notification to `/api/v1/payments/payhere/notify`. The handler checks, in order:
   - the required fields are present;
   - `md5sig` matches, compared in constant time;
   - the merchant id is ours;
   - the payment reference is known;
   - the amount and currency match what was requested;
   - the PayHere `payment_id` is not already recorded on another payment.

   It then applies the status with the payment and order rows locked. Repeated notifications are recognised and change nothing. A late `pending` or `failed` never downgrades a paid payment. Status codes: 2 success, 0 pending, −1 cancelled, −2 failed, −3 chargeback.
4. Every notification, valid or not, is written to `payment_events`. Card holder name and expiry are dropped, and the card number is stored masked only.
5. `return_url` carries no payment result (PayHere documents this). The storefront polls `GET /orders/{number}` until `payment_status` is no longer `pending`.

A failed or cancelled payment can be retried. Each attempt gets its own PayHere `order_id` (`BT-…-1`, `BT-…-2`).

**Cash on delivery:** the order is created with a `pending` payment. Only an administrator can record the cash (`POST /admin/orders/{number}/cod-collection`), and only once the order is ready, out for delivery or delivered. There is no customer endpoint that changes a payment.

### Revenue

Revenue counts orders with `payment_status = paid` (a verified Stripe or PayHere payment, or COD collected) that were not cancelled or rejected. Daily and monthly buckets use the restaurant's timezone (`Asia/Colombo`), not UTC.

---

## Configuration

Everything lives in `.env`; see [.env.example](.env.example) for every key. Never commit `.env`.

| Key | Purpose |
| --- | --- |
| `DB_*` | PostgreSQL connection. The connection pins the session timezone to UTC. |
| `FRONTEND_URL` | Storefront origin. Used for CORS and the Stripe/PayHere return and cancel pages. |
| `STRIPE_SECRET_KEY` | `sk_test_…` (sandbox) or `sk_live_…`. Stripe is offered to customers only once this is set. Server only. |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` signing secret of the webhook endpoint. Without it webhooks answer 503 and payments are confirmed only by the return page. |
| `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL` | Default `FRONTEND_URL/?checkout=complete` and `?checkout=cancelled`; `&order=<number>` is appended. |
| `STRIPE_SESSION_MINUTES` | How long the payment page stays open (30–1440, default 30). |
| `STRIPE_API_BASE` | Development only: point the SDK at a local mock. Leave blank. |
| `CORS_ALLOWED_ORIGINS` | Optional extra allowed origins, comma-separated. |
| `PAYHERE_MERCHANT_ID`, `PAYHERE_MERCHANT_SECRET` | From the PayHere portal (Integrations → add your domain). |
| `PAYHERE_SANDBOX` | `true` → `sandbox.payhere.lk`; `false` → `www.payhere.lk`. |
| `PAYHERE_RETURN_URL`, `PAYHERE_CANCEL_URL` | Where PayHere sends the shopper. `?order=<number>` is appended. |
| `PAYHERE_NOTIFY_URL` | Must be publicly reachable. Blank means `APP_URL/api/v1/payments/payhere/notify`. |
| `CLOUDINARY_*` | Product image uploads. Without them, uploads answer 503 and everything else works. |
| `RESTAURANT_*`, `ORDER_UNPAID_EXPIRY_MINUTES`, `ORDER_ALERT_EMAIL` | Restaurant name, timezone, PayHere fallback address, unpaid-order expiry, and an extra inbox for new orders. |
| `SANCTUM_TOKEN_EXPIRATION` | Token lifetime in minutes (default 7 days). |
| `MAIL_*`, `QUEUE_CONNECTION` | Notification delivery. The default `MAIL_MAILER=log` writes emails to `storage/logs`. |

Runtime settings (delivery fee, free-delivery threshold, minimum order, prep time, and switches for accepting orders, delivery, pickup, COD, Stripe and PayHere) are edited through `PATCH /api/v1/admin/settings`. Defaults are in `config/restaurant.php`.

### Testing Stripe locally

1. Put your test secret key in `.env`: `STRIPE_SECRET_KEY=sk_test_…` (Dashboard → Developers → API keys).
2. `stripe login`, then `stripe listen --forward-to localhost:8000/api/v1/payments/stripe/webhook`. Copy the `whsec_…` it prints into `STRIPE_WEBHOOK_SECRET` (`php artisan serve` restarts itself when `.env` changes).
3. Check out on the storefront with card `4242 4242 4242 4242`, any future expiry and any CVC. `4000 0000 0000 0002` is declined; `4000 0025 0000 3155` asks for 3-D Secure.
4. `stripe trigger checkout.session.completed` sends a test event, which this API logs as `ignored` / `unknown_session` because it did not create that session.

In production add an endpoint in Dashboard → Developers → Webhooks for `https://<api>/api/v1/payments/stripe/webhook` with the five events above, and use its signing secret.

### Testing PayHere in the sandbox

PayHere cannot reach `localhost`, so expose the API through a tunnel first:

1. Start a tunnel, e.g. `herd share` or `ngrok http 8000`.
2. Set `PAYHERE_NOTIFY_URL=https://<tunnel>/api/v1/payments/payhere/notify`.
3. Add the storefront domain in the PayHere sandbox portal and copy the merchant id and secret into `.env`.
4. Pay with a sandbox test card. Then check `payment_events` and `GET /api/v1/orders/{number}`.

---

## Security

- Sanctum bearer tokens. Logout revokes the current token, and a password change revokes all others.
- `role` and suspension are not mass-assignable, and no customer endpoint can set them. The first administrator comes from `php artisan app:create-admin` (or the `SEED_ADMIN_*` variables). After that, administrators can promote, demote or suspend accounts with `PATCH /admin/users/{id}`, but never their own. The acting admin is re-checked with every admin row locked, so there is always at least one administrator.
- Suspended accounts can't sign in, and Sanctum rejects their tokens (`AppServiceProvider`). Suspension and demotion also revoke all of the account's tokens.
- Every admin write is recorded in `admin_activity_logs`, with sensitive fields redacted.
- Policies return 404 (not 403) for other customers' orders, payments and addresses, so order numbers cannot be probed.
- Rate limits:
  - login and register: 5 per minute per email and IP, plus 20 per minute per IP;
  - checkout and payment start: 10 per minute per user;
  - PayHere notify: 120 per minute per IP;
  - the API as a whole: 120 per minute.
- CORS only allows `FRONTEND_URL` (plus `CORS_ALLOWED_ORIGINS`).
- All input is validated by Form Requests. LIKE wildcards in searches are escaped.
- 404s never reveal model names. Business errors return `{message, code, details}`. `APP_DEBUG=false` in production hides stack traces.
- In production, passwords must be at least 10 characters with letters and numbers, and are checked against known breaches. Hashing is bcrypt.
- Responses carry `X-Content-Type-Options`, `X-Frame-Options` and `Referrer-Policy`, and personal data responses are `no-store`.

---

## Operations

| Task | Command |
| --- | --- |
| Worker for notifications | `php artisan queue:work` (supervise it in production) |
| Scheduler | `php artisan schedule:work`, or cron `* * * * * php artisan schedule:run` |
| Expire unpaid online orders now | `php artisan orders:expire-unpaid [--minutes=60]` |
| Delete abandoned guest carts | `php artisan carts:prune-guests` |
| Create or promote an admin | `php artisan app:create-admin` |
| Regenerate OpenAPI | `php artisan scramble:export --path=docs/openapi.json` |
| Production caches | `php artisan config:cache && php artisan route:cache` |

## Admin portal

The admin portal lives in the storefront project at `/admin` (see Burger_frontend/README.md). It uses `POST /api/v1/admin/login`, which only gives tokens to administrators.

```bash
php artisan app:create-admin                        # create the first administrator (prompts for a password)
php artisan db:seed --class=IngredientSeeder        # starter ingredients and a recipe for each seeded burger (safe to re-run)
php artisan db:seed --class=AddonSeeder             # 18 starter add-ons linked to the burgers (safe to re-run; keeps admin edits)
php artisan db:seed --class=DemoActivitySeeder      # OPT-IN: 30 demo customers and ~90 days of orders, for trying the dashboard
```

`DemoActivitySeeder` refuses to run in production or twice. Its customers use `@example.test` addresses with random, unusable passwords. It doesn't touch product stock. Don't run it on a database you'll go live with.

## Known limitations

- **Add-ons in the UI:** the API supports add-ons end to end (menu, cart, checkout, order history, admin CRUD). The storefront and the admin portal don't show them yet: the storefront still adds plain burgers, and the portal's product editor still says variations aren't available. Product "variations" (e.g. double patty) are modelled as add-ons rather than as a separate variant table.
- **Restaurant name at PayHere:** the item description sent to PayHere still uses `RESTAURANT_NAME` from `.env`; the name edited in the admin portal appears on the website (`GET /restaurant`).
- **Refunds:** Stripe refunds are made in the Stripe Dashboard and PayHere refunds in the PayHere merchant portal. The API flags orders as `refund_required` but calls neither provider's refund API, and a refund made in the Dashboard is not reflected back on the order.
- **Delivery fee:** one flat fee with a free-delivery threshold. There is no per-area pricing.
- **Checkout requires an account:** guests can build a cart, but placing an order requires an account, so orders can be tracked and PayHere gets the customer's contact details.
- **Password reset:** there is no password-reset-by-email flow yet (it needs a mail provider).
- **Placeholder menu data:** the seeded prices take the storefront's numbers as rupees (1450 → LKR 1,450.00). Set real prices through the admin API. The seeded images point at the storefront's own `/images/products/*.svg` until photos are uploaded to Cloudinary.
