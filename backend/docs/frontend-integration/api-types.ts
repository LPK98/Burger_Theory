/**
 * Burger Theory API v1 — response and request types.
 *
 * Copy into the storefront (e.g. Burger_frontend/src/services/api/types.ts).
 *
 * Conventions
 * - Every money field is an INTEGER number of cents (minor units) of `currency` (LKR),
 *   the same convention as the frontend's existing `Product.price`. 145000 = LKR 1,450.00.
 * - Timestamps are ISO-8601 strings in UTC.
 * - Single resources are wrapped as `{ data: T }`; lists as `{ data: T[], links, meta }`.
 */

export type Cents = number
export type IsoDateTime = string

export interface ApiItem<T> {
  data: T
}

export interface Paginated<T> {
  data: T[]
  links: { first: string | null; last: string | null; prev: string | null; next: string | null }
  meta: {
    current_page: number
    from: number | null
    last_page: number
    path: string
    per_page: number
    to: number | null
    total: number
  }
}

// ── Errors ────────────────────────────────────────────────────────────────────

/** 422 validation failure. */
export interface ValidationErrorBody {
  message: string
  errors: Record<string, string[]>
}

/** Business-rule failure (422/409/403/503) and 404s. */
export interface DomainErrorBody {
  message: string
  code: ApiErrorCode
  details?: Record<string, unknown>
}

export type ApiErrorCode =
  | 'not_found'
  | 'forbidden'
  | 'cart_empty'
  | 'product_unavailable'
  | 'insufficient_stock'
  | 'quantity_limit'
  | 'coupon_not_found'
  | 'coupon_inactive'
  | 'coupon_not_started'
  | 'coupon_expired'
  | 'coupon_exhausted'
  | 'coupon_already_used'
  | 'coupon_minimum_not_met'
  | 'not_accepting_orders'
  | 'fulfilment_unavailable'
  | 'payment_method_unavailable'
  | 'below_minimum_order'
  | 'invalid_status_transition'
  | 'order_not_cancellable'
  | 'payment_required'
  | 'nothing_to_pay'
  | 'payment_gateway_not_configured'
  | 'order_not_payable'
  | 'payment_already_settled'
  | 'not_cash_on_delivery'
  | 'cash_not_collectable'
  | 'review_requires_purchase'
  | 'review_exists'
  | 'image_storage_not_configured'
  | 'image_upload_failed'
  | 'slug_taken'

// ── Enums ─────────────────────────────────────────────────────────────────────

export type UserRole = 'customer' | 'admin'
export type FulfilmentType = 'delivery' | 'pickup'
export type PaymentMethod = 'payhere' | 'cod'
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'charged_back' | 'refund_required'
export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'rejected'
export type StockStatus = 'unlimited' | 'in_stock' | 'low_stock' | 'out_of_stock'

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface User {
  id: number
  name: string
  email: string
  phone: string | null
  role: UserRole
  created_at: IsoDateTime
}

export interface AuthPayload {
  user: User
  /** Send as `Authorization: Bearer <token>`. */
  token: string
  token_type: 'Bearer'
  expires_at: IsoDateTime | null
}

export interface RegisterRequest {
  name: string
  email: string
  phone?: string | null
  password: string
  password_confirmation: string
  device_name?: string
}

export interface LoginRequest {
  email: string
  password: string
  device_name?: string
}

// ── Menu ──────────────────────────────────────────────────────────────────────

export interface ImageRef {
  url: string
  alt: string | null
}

export interface ProductImage extends ImageRef {
  id: number
  width: number | null
  height: number | null
  is_primary: boolean
}

export interface CategoryRef {
  id: number
  /** Matches the frontend's Category ids: 'beef' | 'chicken' | 'spicy' | 'plant'. */
  slug: string
  name: string
}

export interface Category extends CategoryRef {
  description: string | null
  sort_order: number
  is_active: boolean
  /** Products currently on the menu. */
  products_count?: number
}

export interface Product {
  id: number
  /** Matches the frontend's Product.id (e.g. 'theory-classic'). */
  slug: string
  name: string
  description: string | null
  price: Cents
  compare_at_price: Cents | null
  currency: 'LKR'
  badge: string | null
  is_featured: boolean
  is_available: boolean
  in_stock: boolean
  stock_status: StockStatus
  /** Largest quantity one cart line may hold (stock and per-item cap). */
  max_quantity: number
  /** Primary image. Seeded images are paths on the storefront itself (/images/products/…). */
  image: ImageRef | null
  images: ProductImage[]
  categories: CategoryRef[]
  rating: { average: number | null; count: number }
}

export interface ProductQuery {
  search?: string
  category?: string
  featured?: boolean
  on_sale?: boolean
  in_stock?: boolean
  min_price?: Cents
  max_price?: Cents
  sort?: 'menu' | 'price' | '-price' | 'name' | '-name' | 'newest' | 'rating'
  per_page?: number
  page?: number
}

export interface Offer {
  code: string
  description: string | null
  discount_type: 'percentage' | 'fixed'
  percentage: number | null
  amount: Cents | null
  max_discount_amount: Cents | null
  min_order_amount: Cents | null
  expires_at: IsoDateTime | null
}

export interface RestaurantInfo {
  name: string
  currency: 'LKR'
  timezone: string
  accepting_orders: boolean
  fulfilment_types: FulfilmentType[]
  /** Only methods that are enabled and configured. */
  payment_methods: PaymentMethod[]
  delivery_fee: Cents
  free_delivery_threshold: Cents | null
  minimum_order_amount: Cents
  estimated_preparation_minutes: number
  max_quantity_per_item: number
}

export interface Review {
  id: number
  product_id: number
  rating: 1 | 2 | 3 | 4 | 5
  title: string | null
  body: string | null
  /** "Kasun S." */
  author: string
  is_verified_purchase: boolean
  is_mine: boolean
  created_at: IsoDateTime
}

// ── Cart ──────────────────────────────────────────────────────────────────────

export type CartIssueCode = 'product_unavailable' | 'insufficient_stock' | 'below_minimum_order' | 'not_accepting_orders' | 'fulfilment_unavailable'

export interface CartLine {
  /** Cart line id: use it for PATCH/DELETE /cart/items/{id}. */
  id: number
  product: {
    id: number
    slug: string
    name: string
    image: ImageRef | null
    max_quantity: number
  }
  quantity: number
  unit_price: Cents
  line_total: Cents
  issue: 'product_unavailable' | 'insufficient_stock' | null
}

export interface Cart {
  /** Guest carts only: store it and send it back as the X-Cart-Token header. */
  token: string | null
  currency: 'LKR'
  fulfilment_type: FulfilmentType
  items: CartLine[]
  item_count: number
  coupon: {
    code: string
    description: string | null
    is_valid: boolean
    error: { code: ApiErrorCode; message: string } | null
  } | null
  subtotal: Cents
  discount_total: Cents
  delivery_fee: Cents
  total: Cents
  minimum_order_amount: Cents
  free_delivery_threshold: Cents | null
  can_checkout: boolean
  issues: { code: CartIssueCode; message: string; product_id?: number }[]
}

export interface AddCartItemRequest {
  /** Send product_slug (the frontend id) or product_id. Never a price. */
  product_slug?: string
  product_id?: number
  quantity?: number
}

// ── Addresses ─────────────────────────────────────────────────────────────────

export interface AddressInput {
  label?: string | null
  recipient_name: string
  phone: string
  line1: string
  line2?: string | null
  city: string
  postal_code?: string | null
  delivery_instructions?: string | null
}

export interface Address extends Required<AddressInput> {
  id: number
  is_default: boolean
}

// ── Orders & payments ─────────────────────────────────────────────────────────

export interface PlaceOrderRequest {
  fulfilment_type: FulfilmentType
  payment_method: PaymentMethod
  /** Delivery: a saved address id, or an inline `address` (not both). */
  address_id?: number
  address?: Omit<AddressInput, 'label'>
  save_address?: boolean
  contact_phone?: string
  notes?: string
}

export interface Payment {
  reference: string
  order_number?: string
  method: PaymentMethod
  status: PaymentStatus
  amount: Cents
  currency: 'LKR'
  provider_method: string | null
  /** Masked by PayHere, e.g. "************1292". */
  card_mask: string | null
  status_message: string | null
  paid_at: IsoDateTime | null
  collected_at: IsoDateTime | null
  created_at: IsoDateTime
  updated_at: IsoDateTime
}

export interface OrderItem {
  product_id: number | null
  product_slug: string | null
  name: string
  unit_price: Cents
  quantity: number
  line_total: Cents
}

export interface Order {
  order_number: string
  status: OrderStatus
  status_label: string
  payment_method: PaymentMethod
  payment_status: PaymentStatus
  fulfilment_type: FulfilmentType
  currency: 'LKR'
  subtotal: Cents
  discount_total: Cents
  delivery_fee: Cents
  total: Cents
  coupon_code: string | null
  customer: { name: string; email: string; phone: string }
  delivery_address: Omit<AddressInput, 'label'> | null
  notes: string | null
  items: OrderItem[]
  item_count: number
  payment: Payment | null
  /** Order tracking. */
  timeline: { status: OrderStatus; label: string; note: string | null; at: IsoDateTime }[]
  can_cancel: boolean
  can_pay_online: boolean
  cancellation_reason: string | null
  estimated_ready_at: IsoDateTime | null
  paid_at: IsoDateTime | null
  delivered_at: IsoDateTime | null
  cancelled_at: IsoDateTime | null
  created_at: IsoDateTime
  updated_at: IsoDateTime
}

export interface PlaceOrderResponse extends ApiItem<Order> {
  meta: {
    /** false when an Idempotency-Key matched an earlier order (HTTP 200 instead of 201). */
    created: boolean
    next_action: 'payhere_checkout' | null
  }
}

export interface PayHereCheckout {
  payment: Payment
  /** https://sandbox.payhere.lk/pay/checkout or https://www.payhere.lk/pay/checkout */
  action_url: string
  method: 'POST'
  sandbox: boolean
  /** Post these exactly as given; `hash` is computed by the server. */
  fields: Record<string, string>
}

export interface AppNotification {
  id: string
  type: 'order_placed' | 'order_status' | 'payment_received' | 'new_order' | null
  data: Record<string, unknown> & { message?: string; order_number?: string }
  read_at: IsoDateTime | null
  created_at: IsoDateTime
}
