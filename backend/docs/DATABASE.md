# Burger Theory: database

PostgreSQL 18 on the local Windows service `postgresql-x64-18`.

| Setting | Value |
| --- | --- |
| Host / port | `127.0.0.1` / `5432` |
| User | `postgres` (password only in `backend/.env`, never in code) |
| App database | `burger_theory` |
| Test database | `burger_theory_test`. `php artisan test` **wipes it** on every run. |
| Money columns | `NUMERIC(10,2)` in LKR. The API speaks integer cents (`145000` = LKR 1,450.00). |
| Timestamps | `timestamptz`, stored in UTC. Reports bucket by `Asia/Colombo`. |

Ready-made inspection queries are in [pgadmin-queries.sql](pgadmin-queries.sql).

---

## 1. Creating the databases (only if they don't exist)

Both databases already exist on this machine. These commands are for a fresh machine. They only *create*; nothing here drops or overwrites a database.

**PowerShell** (prompts for the `postgres` password):

```powershell
$pg = "C:\Program Files\PostgreSQL\18\bin"
& "$pg\psql.exe" -U postgres -h 127.0.0.1 -p 5432 -tAc "SELECT datname FROM pg_database WHERE datname LIKE 'burger_theory%'"
& "$pg\createdb.exe" -U postgres -h 127.0.0.1 -p 5432 -E UTF8 burger_theory
& "$pg\createdb.exe" -U postgres -h 127.0.0.1 -p 5432 -E UTF8 burger_theory_test
```

**SQL** (pgAdmin Query Tool connected to the `postgres` database). `CREATE DATABASE` fails harmlessly with "already exists" if it's there:

```sql
SELECT datname FROM pg_database WHERE datname LIKE 'burger_theory%';
CREATE DATABASE burger_theory ENCODING 'UTF8';
CREATE DATABASE burger_theory_test ENCODING 'UTF8';
```

Then point `backend/.env` at it:

```dotenv
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=burger_theory
DB_USERNAME=postgres
DB_PASSWORD='your-password'   # single quotes: a # in an unquoted value starts a comment
```

## 2. Migrations and seed data

```bash
cd backend
php artisan migrate:status     # what has run
php artisan migrate            # run anything new (never drops data)
php artisan db:seed            # idempotent: safe to run again
```

`php artisan migrate:fresh --seed` drops **every table** and rebuilds. Only use it on a database you're happy to lose.

Migrations, in the order they run:

| # | Migration | Creates / changes |
| --- | --- | --- |
| 1 | `0001_01_01_000000_create_users_table` | `users` (role CHECK customer/admin, soft deletes), `password_reset_tokens`, `sessions` |
| 2 | `0001_01_01_000001_create_cache_table` | `cache`, `cache_locks` (also rate-limit counters) |
| 3 | `0001_01_01_000002_create_jobs_table` | `jobs`, `job_batches`, `failed_jobs` (queued notifications) |
| 4 | `2026_11_22_044958_create_personal_access_tokens_table` | `personal_access_tokens` (Sanctum API tokens) |
| 5 | `2026_11_22_100000_create_categories_table` | `categories` |
| 6 | `2026_11_22_100100_create_products_table` | `products`, `category_product` |
| 7 | `2026_11_22_100200_create_product_images_table` | `product_images` |
| 8 | `2026_11_22_100300_create_addresses_table` | `addresses` |
| 9 | `2026_11_22_100400_create_coupons_table` | `coupons` |
| 10 | `2026_11_22_100500_create_carts_table` | `carts`, `cart_items` |
| 11 | `2026_11_22_100600_create_orders_table` | `orders`, `order_items`, `order_status_histories` |
| 12 | `2026_11_22_100700_create_payments_table` | `payments`, `payment_events` |
| 13 | `2026_11_22_100800_create_coupon_usages_table` | `coupon_usages` |
| 14 | `2026_11_22_100900_create_reviews_table` | `reviews` |
| 15 | `2026_11_22_101000_create_restaurant_settings_table` | `restaurant_settings` |
| 16 | `2026_11_22_101100_create_inventory_logs_table` | `inventory_logs` |
| 17 | `2026_11_22_101200_create_notifications_table` | `notifications` |
| 18 | `2026_11_23_100000_create_ingredients_tables` | `ingredients`, `ingredient_movements`, `ingredient_product` |
| 19 | `2026_11_24_100000_create_addons_tables` | `addons`, `addon_product`, `cart_item_addons`, `order_item_addons`; adds `cart_items.options_key` and `order_items.addons_unit_price` |
| 20 | `2026_11_24_100100_add_suspension_to_users_table` | adds `users.suspended_at`, `users.suspension_reason` |
| 21 | `2026_11_24_100200_create_admin_activity_logs_table` | `admin_activity_logs` |
| 22 | `2026_11_25_100000_create_opening_hours_tables` | `opening_hours` (seeded with 7 days, copied from the old `opening_hours` setting, which is then removed), `special_opening_hours` |

Seeders (`php artisan db:seed` runs them in this order):

| Seeder | Data |
| --- | --- |
| `RestaurantSettingsSeeder` | Delivery fee, free-delivery threshold, minimum order, switches, restaurant profile |
| `MenuSeeder` | 4 categories, the storefront's 9 burgers (same slugs as `Burger_frontend/src/data/products.ts`), opening stock 50 each |
| `IngredientSeeder` | 31 kitchen ingredients and a recipe for each burger |
| `AddonSeeder` | 18 add-ons (toppings, sauces, extras, a side), linked to burgers by category |
| `DemoCouponSeeder` | `WELCOME10`, `STACK300`, `BURGERWEEK` (non-production only) |
| admin (inline) | Created only when `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` are set in `.env` |
| `DemoActivitySeeder` | **Opt-in**: `php artisan db:seed --class=DemoActivitySeeder` for 30 demo customers and ~90 days of orders |

---

## 3. Schema

`PK` primary key · `FK` foreign key (delete rule) · `UQ` unique · `?` nullable. Every main table has `created_at` / `updated_at`, and soft-deleted tables also have `deleted_at`.

### Users and access

| Table | Columns | Keys and rules |
| --- | --- | --- |
| **users** | id, name, email, phone?, role, email_verified_at?, password (bcrypt), remember_token?, suspended_at?, suspension_reason?, deleted_at? | UQ email (stored lower-case). CHECK role ∈ customer, admin. Soft delete. |
| **personal_access_tokens** | id, tokenable_type, tokenable_id, name, token (SHA-256), abilities?, last_used_at?, expires_at? | UQ token. Sanctum bearer tokens; revoked on logout, password change, suspension or demotion. |
| **addresses** | id, user_id, label?, recipient_name, phone, line1, line2?, city, postal_code?, delivery_instructions?, is_default, deleted_at? | FK user (CASCADE). UQ one default per user (partial). |
| **admin_activity_logs** | id, user_id?, action, method, path, subject_type?, subject_id?, status_code, properties (jsonb)?, ip_address?, user_agent?, created_at | FK user (SET NULL). Append-only. Passwords, tokens and secrets are redacted before storing. |

Roles and permissions are deliberately two roles. `customer` can use the storefront, cart, checkout and their own orders, addresses and reviews (policies answer 404 for anyone else's). `admin` can use everything under `/api/v1/admin`, guarded by the `admin` middleware.

### Catalogue

| Table | Columns | Keys and rules |
| --- | --- | --- |
| **categories** | id, name, slug, description?, sort_order, is_active, deleted_at? | UQ slug among non-deleted. |
| **products** | id, slug, name, description?, price, compare_at_price?, badge?, is_available, is_featured, track_stock, stock_quantity, low_stock_threshold, sort_order, deleted_at? | UQ slug among non-deleted. CHECK price ≥ 0, compare_at_price > price, stock ≥ 0. |
| **category_product** | category_id, product_id | PK both. FK both (CASCADE). |
| **product_images** | id, product_id, url, public_id? (Cloudinary), alt_text?, width?, height?, is_primary, sort_order | FK product (CASCADE). UQ one primary per product. |
| **addons** | id, slug, name, description?, kind, price, is_available, sort_order, deleted_at? | UQ slug among non-deleted. CHECK kind ∈ topping, sauce, side, extra; price ≥ 0. |
| **addon_product** | product_id, addon_id, max_quantity, sort_order | PK both. FK both (CASCADE). CHECK max_quantity 1–10. Which add-ons each burger offers. |
| **reviews** | id, product_id, user_id, order_id?, rating, title?, body?, is_published, deleted_at? | FK product, user (CASCADE), order (SET NULL). UQ one per customer and product. |

"Product variations" such as a double patty are add-ons (`Extra smashed beef patty`). That avoids a second pricing dimension; a line is priced as product price + Σ(add-on price × quantity).

### Cart and orders

| Table | Columns | Keys and rules |
| --- | --- | --- |
| **carts** | id, token (uuid), user_id?, coupon_id? | UQ token, UQ user_id (one cart per customer; guest carts have none). FK user (CASCADE), coupon (SET NULL). |
| **cart_items** | id, cart_id, product_id, quantity, options_key | FK cart, product (CASCADE). UQ (cart_id, product_id, options_key): the same burger with different add-ons is a separate line. CHECK quantity > 0. |
| **cart_item_addons** | cart_item_id, addon_id, quantity | PK both. FK both (CASCADE). Quantity is per burger. |
| **orders** | id, order_number, user_id, status, payment_method, payment_status, fulfilment_type, currency, subtotal, discount_total, delivery_fee, total, coupon_id?, coupon_code?, customer_name/email/phone, delivery_* (snapshot), customer_notes?, idempotency_key?, estimated_ready_at?, paid_at?, delivered_at?, cancelled_at?, cancelled_by?, cancellation_reason? | UQ order_number, UQ (user_id, idempotency_key). FK user (**RESTRICT**: a customer with orders can't be hard-deleted), coupon (SET NULL). CHECK total = subtotal − discount + delivery fee, plus status, payment and fulfilment values, and a delivery address for delivery orders. Never deleted. |
| **order_items** | id, order_id, product_id?, product_name, product_slug?, unit_price, addons_unit_price, quantity, line_total | FK order (CASCADE), product (SET NULL). CHECK line_total = unit_price × quantity, 0 ≤ addons_unit_price ≤ unit_price. Name and price are snapshots. |
| **order_item_addons** | id, order_item_id, addon_id?, addon_name, unit_price, quantity | FK order item (CASCADE), add-on (SET NULL). Snapshot of each add-on as sold. |
| **order_status_histories** | id, order_id, from_status?, to_status, actor_type, changed_by_id?, note?, created_at | FK order (CASCADE), changed_by user (SET NULL). Order tracking timeline and delivery status. |

### Payments

| Table | Columns | Keys and rules |
| --- | --- | --- |
| **payments** | id, order_id, method (cod, payhere), status, amount, currency, reference, provider_payment_id?, provider_status_code?, provider_status_message?, provider_method?, card_mask?, collected_by_id?, collected_at?, paid_at? | FK order (RESTRICT), collected_by user (SET NULL). UQ reference, UQ (method, provider_payment_id), UQ one `paid` payment per order. Only a masked card number is ever stored. |
| **payment_events** | id, payment_id?, provider, reference?, provider_status_code?, signature_valid, outcome, outcome_reason?, payload (jsonb, card holder and expiry removed), ip_address?, created_at | FK payment (SET NULL). Every PayHere notification, valid or not. |

### Promotions

| Table | Columns | Keys and rules |
| --- | --- | --- |
| **coupons** | id, code, description?, discount_type (percentage, fixed), percentage?, amount?, max_discount_amount?, min_order_amount?, usage_limit?, usage_limit_per_user?, times_used, starts_at?, expires_at?, is_active, is_public, deleted_at? | UQ code among non-deleted. CHECK type matches percentage/amount, expires_at > starts_at. `is_public` coupons appear on `GET /offers`; a dated, capped coupon is a campaign. |
| **coupon_usages** | id, coupon_id, user_id, order_id, discount_amount | FK all (CASCADE). UQ order_id. |

### Delivery, inventory and settings

| Table | Columns | Keys and rules |
| --- | --- | --- |
| **restaurant_settings** | id, key, value (jsonb)?, updated_by_id? | UQ key. Delivery fee, free-delivery threshold, minimum order, prep time, on/off switches, restaurant profile, `temporarily_closed`, `hours_announcement`. |
| **opening_hours** | id, day_of_week (1 = Mon … 7 = Sun), is_open, opens_at?, closes_at?, updated_by_id? | UQ day_of_week; CHECK times set iff open, open ≠ close. Wall-clock times in Asia/Colombo; closes_at < opens_at means after midnight. |
| **special_opening_hours** | id, starts_on, ends_on, is_closed, opens_at?, closes_at?, title, note?, created_by_id?, updated_by_id? | CHECK ends_on ≥ starts_on; times set iff not closed. EXCLUDE (gist) overlapping date ranges. Holidays, closures and special hours. |
| **inventory_logs** | id, product_id, order_id?, user_id?, change, quantity_before, quantity_after, reason, note?, created_at | FK product (CASCADE), order and user (SET NULL). Every product stock movement. |
| **ingredients** | id, name, unit, stock_quantity, min_stock_level, notes?, deleted_at? | UQ lower(name) among non-deleted. |
| **ingredient_product** | product_id, ingredient_id, quantity | Recipes. FK both (CASCADE). |
| **ingredient_movements** | id, ingredient_id, order_id?, user_id?, change, quantity_before, quantity_after, reason, note?, created_at | FK ingredient (CASCADE), order and user (SET NULL). |
| **notifications** | id (uuid), type, notifiable_type, notifiable_id, data (jsonb), read_at? | Laravel database notifications (order updates). |

Sales reports are computed from `orders`, `order_items` and `payments` (see `App\Services\Dashboard\DashboardService`), so there is no separate reports table.

### Relationships at a glance

```
users ─┬─< addresses
       ├─< orders ─┬─< order_items ─< order_item_addons >─ addons
       │           ├─< order_status_histories
       │           ├─< payments ─< payment_events
       │           └─< coupon_usages >─ coupons
       ├── carts ─< cart_items ─< cart_item_addons >─ addons
       ├─< reviews >─ products
       └─< admin_activity_logs

categories >─< products ─┬─< product_images
                         ├─< addon_product >─ addons
                         ├─< ingredient_product >─ ingredients ─< ingredient_movements
                         └─< inventory_logs
```

---

## 4. Inspecting the database in pgAdmin 4

1. Open pgAdmin 4. In the browser tree, expand **Servers → PostgreSQL 18**. Enter the `postgres` password if asked.
   - If there's no server entry: right-click **Servers → Register → Server…**. On **General**, set Name to `Local PG18`. On **Connection**, set Host to `127.0.0.1`, Port to `5432`, Maintenance DB to `postgres` and Username to `postgres`. Then **Save**.
2. Expand **Databases → burger_theory → Schemas → public → Tables**. The 36 tables are listed there; press F5 on **Tables** after running migrations.
3. To browse a table: right-click it, then **View/Edit Data → All Rows** (or **First 100 Rows**).
4. To see a table's columns, keys and constraints: select it and open the **Properties** and **SQL** tabs, or expand **Columns / Constraints / Indexes** under it.
5. To run queries: select `burger_theory`, then **Tools → Query Tool** (Alt+Shift+Q). Open `backend/docs/pgadmin-queries.sql` with the folder icon, place the cursor in one query, and press **F5** (or select it and press F5).
6. To see the relationships as a diagram: right-click `burger_theory` → **ERD For Database**.

Treat edits made in the data grid with care. They bypass the API's validation, stock logs and audit trail. Prefer the admin API for real changes.
