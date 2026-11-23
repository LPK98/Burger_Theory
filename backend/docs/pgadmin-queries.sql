-- Burger Theory: read-only inspection queries for pgAdmin 4 (Query Tool on burger_theory).
-- Put the cursor in one statement and press F5. Nothing here changes data.
-- Money columns are NUMERIC(10,2) in LKR.

-- 1. Every table with its row count -------------------------------------------------------
SELECT relname AS table_name, n_live_tup AS approx_rows
FROM pg_stat_user_tables
ORDER BY relname;

-- Exact counts for the main tables
SELECT 'users' AS t, COUNT(*) FROM users UNION ALL
SELECT 'categories', COUNT(*) FROM categories UNION ALL
SELECT 'products', COUNT(*) FROM products UNION ALL
SELECT 'addons', COUNT(*) FROM addons UNION ALL
SELECT 'addon_product', COUNT(*) FROM addon_product UNION ALL
SELECT 'coupons', COUNT(*) FROM coupons UNION ALL
SELECT 'orders', COUNT(*) FROM orders UNION ALL
SELECT 'order_items', COUNT(*) FROM order_items UNION ALL
SELECT 'payments', COUNT(*) FROM payments UNION ALL
SELECT 'ingredients', COUNT(*) FROM ingredients UNION ALL
SELECT 'admin_activity_logs', COUNT(*) FROM admin_activity_logs;

-- 2. Columns of one table (change the name) -----------------------------------------------
SELECT column_name, data_type, character_maximum_length, numeric_precision, numeric_scale, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'orders'
ORDER BY ordinal_position;

-- 3. Foreign keys and their delete rules ---------------------------------------------------
SELECT tc.table_name, kcu.column_name, ccu.table_name AS references_table, rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name, kcu.column_name;

-- 4. CHECK constraints and unique / partial indexes ---------------------------------------
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype = 'c' AND connamespace = 'public'::regnamespace
ORDER BY 1, 2;

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- 5. Migrations that have run -------------------------------------------------------------
SELECT id, migration, batch FROM migrations ORDER BY id;

-- 6. Accounts (never select the password column) -------------------------------------------
SELECT id, name, email, phone, role, email_verified_at, suspended_at, suspension_reason, created_at, deleted_at
FROM users
ORDER BY id;

-- 7. Menu: categories and products -----------------------------------------------------------
SELECT c.slug AS category, p.id, p.slug, p.name, p.price, p.is_available, p.stock_quantity
FROM products p
JOIN category_product cp ON cp.product_id = p.id
JOIN categories c ON c.id = cp.category_id
WHERE p.deleted_at IS NULL
ORDER BY c.sort_order, p.sort_order;

-- 8. Add-ons, and which burgers offer them ---------------------------------------------------
SELECT id, slug, name, kind, price, is_available, sort_order, deleted_at
FROM addons
ORDER BY sort_order;

SELECT p.name AS product, a.name AS addon, a.kind, a.price, ap.max_quantity
FROM addon_product ap
JOIN products p ON p.id = ap.product_id
JOIN addons a ON a.id = ap.addon_id
ORDER BY p.sort_order, ap.sort_order;

-- 9. Promotions -----------------------------------------------------------------------------
SELECT code, description, discount_type, percentage, amount, max_discount_amount, min_order_amount,
       usage_limit, usage_limit_per_user, times_used, starts_at, expires_at, is_active, is_public
FROM coupons
WHERE deleted_at IS NULL
ORDER BY code;

-- 10. Orders with their items and add-ons ----------------------------------------------------
SELECT o.order_number, o.status, o.payment_method, o.payment_status, o.fulfilment_type,
       o.subtotal, o.discount_total, o.delivery_fee, o.total, o.customer_name, o.created_at
FROM orders o
ORDER BY o.created_at DESC
LIMIT 50;

SELECT o.order_number, oi.product_name, oi.quantity, oi.unit_price, oi.addons_unit_price, oi.line_total,
       string_agg(oia.quantity || ' x ' || oia.addon_name, ', ' ORDER BY oia.id) AS addons
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
LEFT JOIN order_item_addons oia ON oia.order_item_id = oi.id
GROUP BY o.order_number, o.created_at, oi.id
ORDER BY o.created_at DESC, oi.id;

-- Order tracking timeline
SELECT o.order_number, h.from_status, h.to_status, h.actor_type, u.name AS changed_by, h.note, h.created_at
FROM order_status_histories h
JOIN orders o ON o.id = h.order_id
LEFT JOIN users u ON u.id = h.changed_by_id
ORDER BY h.created_at DESC
LIMIT 100;

-- 11. Payments --------------------------------------------------------------------------------
SELECT p.reference, o.order_number, p.method, p.status, p.amount, p.card_mask, p.paid_at, p.collected_at
FROM payments p
JOIN orders o ON o.id = p.order_id
ORDER BY p.created_at DESC
LIMIT 50;

-- 12. Sales: paid revenue per day (restaurant time) --------------------------------------------
SELECT (paid_at AT TIME ZONE 'Asia/Colombo')::date AS day, COUNT(*) AS orders, SUM(total) AS revenue
FROM orders
WHERE payment_status = 'paid' AND status NOT IN ('cancelled', 'rejected')
GROUP BY 1
ORDER BY 1 DESC;

-- Best sellers
SELECT oi.product_name, SUM(oi.quantity) AS sold, SUM(oi.line_total) AS revenue
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
WHERE o.payment_status = 'paid' AND o.status NOT IN ('cancelled', 'rejected')
GROUP BY oi.product_name
ORDER BY sold DESC;

-- 13. Stock ------------------------------------------------------------------------------------
SELECT name, stock_quantity, low_stock_threshold, track_stock
FROM products
WHERE deleted_at IS NULL AND track_stock AND stock_quantity <= low_stock_threshold;

SELECT name, unit, stock_quantity, min_stock_level
FROM ingredients
WHERE deleted_at IS NULL
ORDER BY stock_quantity - min_stock_level;

SELECT l.created_at, p.name, l.change, l.quantity_after, l.reason, l.note
FROM inventory_logs l
JOIN products p ON p.id = l.product_id
ORDER BY l.created_at DESC
LIMIT 50;

-- 14. Administrator activity log ----------------------------------------------------------------
SELECT l.created_at, u.email AS admin, l.action, l.method, l.subject_type, l.subject_id, l.status_code, l.properties
FROM admin_activity_logs l
LEFT JOIN users u ON u.id = l.user_id
ORDER BY l.id DESC
LIMIT 100;

-- 15. Restaurant settings -------------------------------------------------------------------------
SELECT key, value, updated_at FROM restaurant_settings ORDER BY key;
