import type { OpeningStatus, SpecialDate } from '../../services/api/types'

/** Admin API types. Money is integer cents of USD; dates are ISO-8601 strings. */

export type Cents = number

export interface Paginated<T> {
  data: T[]
  meta: { current_page: number; last_page: number; per_page: number; total: number; from: number | null; to: number | null }
}

export interface Item<T> {
  data: T
}

export interface AdminUser {
  id: number
  name: string
  email: string
  phone: string | null
  role: 'customer' | 'admin'
  created_at: string
}

export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'rejected'
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'charged_back' | 'refund_required'
export type PaymentMethod = 'stripe' | 'payhere' | 'cod'
export type Fulfilment = 'delivery' | 'pickup'

// ── Dashboard & reports ────────────────────────────────────────────────────────

export interface BestSeller {
  product_id: number | null
  name: string
  slug: string | null
  quantity_sold: number
  orders: number
  revenue: Cents
}

export interface LowStockIngredient {
  id: number
  name: string
  unit: Unit
  stock_quantity: number
  min_stock_level: number
  stock_status: StockStatus
}

export interface ActivityEvent {
  type: 'signed_up' | 'placed_order' | 'cancelled_order'
  customer_id: number
  customer_name: string
  order_number: string | null
  amount: Cents | null
  at: string
}

export interface DashboardSummary {
  currency: string
  total_revenue: Cents
  paid_orders: number
  today: { revenue: Cents; paid_orders: number; orders_placed: number }
  total_orders: number
  pending_orders: number
  active_orders: number
  completed_orders: number
  cancelled_orders: number
  orders_by_status: Record<OrderStatus, number>
  unpaid_cod_orders: number
  refunds_required: number
  total_customers: number
  new_customers_today: number
  product_availability: { total: number; available: number; unavailable: number; out_of_stock: number; low_stock: number }
  best_sellers: BestSeller[]
  recent_orders: Order[]
  low_stock_products: { id: number; slug: string; name: string; stock_quantity: number; low_stock_threshold: number; is_available: boolean }[]
  low_stock_ingredients: LowStockIngredient[]
  recent_activity: ActivityEvent[]
}

export type Interval = 'day' | 'week' | 'month'

export interface SalesPoint {
  period: string
  orders: number
  revenue: Cents
  discounts: Cents
  placed: number
  cancelled: number
}

export interface SalesReport {
  interval: Interval
  from: string
  to: string
  timezone: string
  currency: string
  totals: { orders: number; revenue: Cents; discounts: Cents; placed: number; cancelled: number }
  series: SalesPoint[]
}

export interface OrderStatistics {
  from: string
  to: string
  timezone: string
  currency: string
  orders_placed: number
  paid_orders: number
  revenue: Cents
  discounts: Cents
  delivery_fees: Cents
  average_order_value: Cents
  completed_orders: number
  cancelled_orders: number
  cancellation_rate: number
  by_status: Record<OrderStatus, number>
  by_fulfilment: Partial<Record<Fulfilment, number>>
  by_payment_method: Partial<Record<PaymentMethod, number>>
  by_hour: { hour: number; orders: number }[]
}

// ── Catalogue ─────────────────────────────────────────────────────────────────

export interface Category {
  id: number
  slug: string
  name: string
  description: string | null
  sort_order: number
  is_active: boolean
  products_count?: number
}

export interface ProductImage {
  id: number
  url: string
  alt: string | null
  width: number | null
  height: number | null
  is_primary: boolean
}

export interface RecipeLine {
  ingredient_id: number
  name: string
  unit: Unit
  quantity: number
}

export type ProductStockStatus = 'in_stock' | 'low_stock' | 'out_of_stock' | 'unlimited'

export interface Product {
  id: number
  slug: string
  name: string
  description: string | null
  price: Cents
  compare_at_price: Cents | null
  currency: string
  badge: string | null
  is_featured: boolean
  is_available: boolean
  in_stock: boolean
  stock_status: ProductStockStatus
  max_quantity: number
  image: { url: string; alt: string | null } | null
  images: ProductImage[]
  categories: { id: number; slug: string; name: string }[]
  rating: { average: number | null; count: number }
  track_stock: boolean
  stock_quantity: number
  low_stock_threshold: number
  sort_order: number
  created_at: string
  updated_at: string
  deleted_at: string | null
  recipe?: RecipeLine[]
}

export interface ProductInput {
  name: string
  description: string | null
  price: Cents
  compare_at_price: Cents | null
  badge: string | null
  is_available: boolean
  is_featured: boolean
  track_stock: boolean
  stock_quantity?: number
  low_stock_threshold: number
  sort_order: number
  category_ids: number[]
}

export interface ProductStockLog {
  id: number
  change: number
  quantity_before: number
  quantity_after: number
  reason: 'sale' | 'order_release' | 'restock' | 'adjustment'
  note: string | null
  order_number?: string | null
  user?: string | null
  created_at: string
}

// ── Orders ────────────────────────────────────────────────────────────────────

export interface Payment {
  id?: number
  reference: string
  order_number?: string
  method: PaymentMethod
  status: PaymentStatus
  amount: Cents
  currency: string
  provider_method: string | null
  card_mask: string | null
  status_message: string | null
  paid_at: string | null
  collected_at: string | null
  created_at: string
  updated_at: string
}

export interface TimelineEntry {
  from: OrderStatus | null
  status: OrderStatus
  label: string
  actor: 'customer' | 'admin' | 'system'
  changed_by: string | null
  note: string | null
  at: string
}

export interface Order {
  id: number
  user_id: number
  order_number: string
  status: OrderStatus
  status_label: string
  payment_method: PaymentMethod
  payment_status: PaymentStatus
  fulfilment_type: Fulfilment
  currency: string
  subtotal: Cents
  discount_total: Cents
  delivery_fee: Cents
  total: Cents
  coupon_code: string | null
  customer: { name: string; email: string; phone: string }
  delivery_address: {
    recipient_name: string | null
    phone: string | null
    line1: string | null
    line2: string | null
    city: string | null
    postal_code: string | null
    delivery_instructions: string | null
  } | null
  notes: string | null
  items: { product_id: number | null; product_slug: string | null; name: string; unit_price: Cents; quantity: number; line_total: Cents }[]
  item_count: number
  payment: Payment | null
  payments?: Payment[]
  timeline?: TimelineEntry[]
  next_statuses: OrderStatus[]
  cancelled_by: string | null
  cancellation_reason: string | null
  estimated_ready_at: string | null
  paid_at: string | null
  delivered_at: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
}

// ── Customers ─────────────────────────────────────────────────────────────────

export interface Customer {
  id: number
  name: string
  email: string
  phone: string | null
  email_verified: boolean
  registered_at: string
  orders_count: number
  total_spent: Cents
  last_order_at: string | null
}

export interface CustomerDetail extends Customer {
  completed_orders: number
  cancelled_orders: number
  paid_orders: number
  average_order_value: Cents
  first_order_at: string | null
  favourite_products: { name: string; quantity: number }[]
  addresses: { id: number; label: string | null; recipient_name: string; phone: string; line1: string; line2: string | null; city: string; postal_code: string | null; is_default: boolean }[]
}

// ── Payments ──────────────────────────────────────────────────────────────────

export interface AdminPayment extends Payment {
  id: number
  provider_payment_id: string | null
  provider_status_code: number | null
  collected_by?: string | null
  order?: {
    order_number: string
    status: OrderStatus
    status_label: string
    payment_status: PaymentStatus
    customer_id: number
    customer_name: string
    customer_email: string
    total: Cents
    created_at: string
  }
  events?: { provider: string; provider_status_code: number | null; signature_valid: boolean; outcome: string; outcome_reason: string | null; at: string }[]
}

export interface PaymentSummary {
  currency: string
  payments: number
  paid: number
  paid_amount: Cents
  pending: number
  pending_amount: Cents
  failed: number
  needs_attention: number
}

// ── Inventory ─────────────────────────────────────────────────────────────────

export type Unit = 'g' | 'kg' | 'ml' | 'l' | 'pcs'
export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock'
export type MovementReason = 'consumption' | 'order_release' | 'restock' | 'adjustment' | 'waste'

export interface Ingredient {
  id: number
  name: string
  unit: Unit
  unit_label: string
  stock_quantity: number
  min_stock_level: number
  stock_status: StockStatus
  notes: string | null
  used_last_7_days: number | null
  days_of_cover: number | null
  products_count?: number
  products?: { id: number; name: string; slug: string; quantity: number }[]
  created_at: string
  updated_at: string
}

export interface IngredientMovement {
  id: number
  ingredient?: { id: number; name: string; unit: Unit }
  change: number
  quantity_before: number
  quantity_after: number
  reason: MovementReason
  reason_label: string
  note: string | null
  order_number?: string | null
  user?: string | null
  created_at: string
}

export interface ConsumptionReport {
  from: string
  to: string
  timezone: string
  ingredients: { id: number; name: string; unit: Unit; deleted: boolean; stock_quantity: number; used: number; restocked: number; wasted: number; adjusted: number }[]
}

// ── Promotions ────────────────────────────────────────────────────────────────

export interface Coupon {
  id: number
  code: string
  description: string | null
  discount_type: 'percentage' | 'fixed'
  percentage: number | null
  amount: Cents | null
  max_discount_amount: Cents | null
  min_order_amount: Cents | null
  usage_limit: number | null
  usage_limit_per_user: number | null
  times_used: number
  starts_at: string | null
  expires_at: string | null
  is_active: boolean
  is_public: boolean
  created_at: string
}

export type CouponInput = Omit<Coupon, 'id' | 'times_used' | 'created_at'>

// ── Settings ──────────────────────────────────────────────────────────────────

export interface OpeningHours {
  day: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
  closed: boolean
  open: string | null
  close: string | null
}

export interface Settings {
  accepting_orders: boolean
  delivery_enabled: boolean
  pickup_enabled: boolean
  cod_enabled: boolean
  payhere_enabled: boolean
  stripe_enabled: boolean
  delivery_fee: Cents
  free_delivery_threshold: Cents | null
  minimum_order_amount: Cents
  estimated_preparation_minutes: number
  restaurant_name: string
  contact_phone: string | null
  contact_email: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  postal_code: string | null
  instagram_url: string | null
  facebook_url: string | null
  logo_url: string | null
}

// ── Opening hours ─────────────────────────────────────────────────────────────

/** The same shapes the storefront reads from GET /opening-hours. */
export type { OpeningStatus, SpecialDate }

export interface WeeklyHours extends OpeningHours {
  overnight: boolean
}

export interface OpeningHoursAdmin {
  timezone: string
  now: string
  today: string
  weekly: WeeklyHours[]
  temporarily_closed: boolean
  announcement: string | null
  status: OpeningStatus
  /** Upcoming entries soonest first, then up to 50 past ones, most recent first. */
  special_dates: SpecialDate[]
}

export interface OpeningHoursUpdate {
  weekly?: OpeningHours[]
  temporarily_closed?: boolean
  announcement?: string | null
}

export interface SpecialDateInput {
  starts_on: string
  ends_on: string
  closed: boolean
  open?: string
  close?: string
  title: string
  note: string | null
}

export interface SettingsResponse {
  data: Settings
  meta: { integrations: { cloudinary: boolean; payhere: boolean; payhere_sandbox: boolean; stripe: boolean; stripe_webhook: boolean; stripe_test_mode: boolean; currency: string; timezone: string } }
}
