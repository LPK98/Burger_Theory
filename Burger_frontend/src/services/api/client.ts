/**
 * Burger Theory API client (Axios), copied from backend/docs/frontend-integration/api-client.ts.
 * The base URL comes from VITE_API_URL (see .env.example) and defaults to the local API.
 *
 * This file owns the only copies of the auth token and the guest cart token, so
 * there is one place that handles authentication. UI state about the signed-in
 * customer lives in src/context/AuthContext.tsx, which subscribes via onAuthTokenChange.
 *
 * Storefront changes from the backend copy: the import path below, an in-memory
 * fallback when localStorage is blocked, and onAuthTokenChange.
 */
import axios, { AxiosError, type AxiosResponse } from 'axios'
import type {
  AddCartItemRequest,
  Address,
  AddressInput,
  ApiErrorCode,
  ApiItem,
  AppNotification,
  AuthPayload,
  Cart,
  Category,
  DomainErrorBody,
  FulfilmentType,
  LoginRequest,
  Offer,
  OpeningHoursInfo,
  Order,
  Paginated,
  PayHereCheckout,
  Payment,
  PlaceOrderRequest,
  PlaceOrderResponse,
  Product,
  ProductQuery,
  RegisterRequest,
  RestaurantInfo,
  Review,
  User,
  ValidationErrorBody,
} from './types'

// ── Configuration ─────────────────────────────────────────────────────────────

export const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1'

const TOKEN_KEY = 'burger-theory:auth-token'
const CART_TOKEN_KEY = 'burger-theory:cart-token'

/**
 * Storage can throw (private mode, blocked site data). Values are also kept in memory,
 * so signing in still works for the current visit when localStorage is unavailable.
 */
const memory = new Map<string, string>()
const storage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return memory.get(key) ?? null
    }
  },
  set(key: string, value: string | null): void {
    if (value === null) memory.delete(key)
    else memory.set(key, value)
    try {
      if (value === null) window.localStorage.removeItem(key)
      else window.localStorage.setItem(key, value)
    } catch {
      // ignore
    }
  },
}

/** `this-tab` covers sign-in, sign-out and 401s here; `other-tab` is another tab of the site. */
type TokenListener = (token: string | null, source: 'this-tab' | 'other-tab') => void
const tokenListeners = new Set<TokenListener>()

export const tokens = {
  auth: () => storage.get(TOKEN_KEY),
  setAuth: (token: string | null) => {
    const changed = storage.get(TOKEN_KEY) !== token
    storage.set(TOKEN_KEY, token)
    if (changed) tokenListeners.forEach((listener) => listener(token, 'this-tab'))
  },
  cart: () => storage.get(CART_TOKEN_KEY),
  setCart: (token: string | null) => storage.set(CART_TOKEN_KEY, token),
}

/**
 * Calls `listener` whenever the auth token is set or dropped: sign-in, sign-out, a 401
 * that discards an expired token, or another tab signing in or out. Returns an unsubscribe.
 */
export function onAuthTokenChange(listener: TokenListener): () => void {
  tokenListeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === TOKEN_KEY || event.key === null) listener(tokens.auth(), 'other-tab')
  }
  window.addEventListener('storage', onStorage)
  return () => {
    tokenListeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  headers: { Accept: 'application/json' },
})

http.interceptors.request.use((config) => {
  const auth = tokens.auth()
  if (auth) config.headers.set('Authorization', `Bearer ${auth}`)
  // Guests are identified by the cart token; signed-in customers by their account.
  const cart = tokens.cart()
  if (!auth && cart) config.headers.set('X-Cart-Token', cart)
  return config
})

http.interceptors.response.use(
  (response) => {
    const cartToken = response.headers['x-cart-token']
    if (typeof cartToken === 'string' && cartToken !== '') tokens.setCart(cartToken)
    return response
  },
  (error: unknown) => {
    if (error instanceof AxiosError && error.response?.status === 401) {
      // Expired or revoked token: drop it so the next request continues as a guest.
      tokens.setAuth(null)
    }
    return Promise.reject(ApiError.from(error))
  },
)

// ── Errors ────────────────────────────────────────────────────────────────────

// Fields are declared explicitly: the storefront compiles with erasableSyntaxOnly,
// which rules out constructor parameter properties.
export class ApiError extends Error {
  readonly status: number
  /** Machine-readable code for business-rule errors (see ApiErrorCode). */
  readonly code: ApiErrorCode | 'validation_failed' | 'network_error' | 'unknown'
  /** Field errors for 422 validation failures, e.g. { email: ['The email has already been taken.'] }. */
  readonly fieldErrors: Record<string, string[]>
  readonly details: Record<string, unknown>

  constructor(
    message: string,
    status: number,
    code: ApiError['code'],
    fieldErrors: Record<string, string[]> = {},
    details: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
    this.details = details
  }

  static from(error: unknown): ApiError {
    if (!(error instanceof AxiosError)) return new ApiError('Something went wrong.', 0, 'unknown')
    if (!error.response) return new ApiError('Cannot reach the server. Check your connection.', 0, 'network_error')

    const { status, data } = error.response as AxiosResponse<Partial<ValidationErrorBody & DomainErrorBody>>
    const message = data?.message ?? 'Something went wrong.'
    if (data?.errors) return new ApiError(message, status, 'validation_failed', data.errors)
    return new ApiError(message, status, data?.code ?? 'unknown', {}, data?.details ?? {})
  }
}

const unwrap = <T>(response: AxiosResponse<ApiItem<T>>) => response.data.data

// ── Auth ──────────────────────────────────────────────────────────────────────

export const auth = {
  /** Registers, stores the token and moves any guest cart into the new account. */
  async register(payload: RegisterRequest): Promise<User> {
    const result = unwrap(await http.post<ApiItem<AuthPayload>>('/register', payload))
    await this.adopt(result)
    return result.user
  },

  async login(payload: LoginRequest): Promise<User> {
    const result = unwrap(await http.post<ApiItem<AuthPayload>>('/login', payload))
    await this.adopt(result)
    return result.user
  },

  async logout(): Promise<void> {
    try {
      await http.post('/logout')
    } finally {
      tokens.setAuth(null)
    }
  },

  me: async () => unwrap(await http.get<ApiItem<User>>('/user')),
  updateProfile: async (changes: Partial<Pick<User, 'name' | 'email' | 'phone'>>) => unwrap(await http.patch<ApiItem<User>>('/user', changes)),
  changePassword: async (current_password: string, password: string, password_confirmation: string) =>
    (await http.put<{ message: string }>('/user/password', { current_password, password, password_confirmation })).data,

  isSignedIn: () => tokens.auth() !== null,

  async adopt(result: AuthPayload): Promise<void> {
    tokens.setAuth(result.token)
    const guestCart = tokens.cart()
    if (guestCart) {
      await http.post('/cart/merge', { cart_token: guestCart }).catch(() => undefined)
      tokens.setCart(null)
    }
  },
}

// ── Menu ──────────────────────────────────────────────────────────────────────

export const menu = {
  restaurant: async () => unwrap(await http.get<ApiItem<RestaurantInfo>>('/restaurant')),
  /** Weekly hours, special dates and the live open/closed status (worked out in Colombo time by the API). */
  openingHours: async () => unwrap(await http.get<ApiItem<OpeningHoursInfo>>('/opening-hours')),
  categories: async () => (await http.get<{ data: Category[] }>('/categories')).data.data,
  products: async (query: ProductQuery = {}) => (await http.get<Paginated<Product>>('/products', { params: query })).data,
  /** By slug (the frontend's product id) or numeric id. */
  product: async (idOrSlug: string | number) => unwrap(await http.get<ApiItem<Product>>(`/products/${encodeURIComponent(String(idOrSlug))}`)),
  offers: async () => (await http.get<{ data: Offer[] }>('/offers')).data.data,
  reviews: async (idOrSlug: string | number, page = 1) => (await http.get<Paginated<Review>>(`/products/${encodeURIComponent(String(idOrSlug))}/reviews`, { params: { page } })).data,
  addReview: async (idOrSlug: string | number, review: { rating: number; title?: string; body?: string }) =>
    unwrap(await http.post<ApiItem<Review>>(`/products/${encodeURIComponent(String(idOrSlug))}/reviews`, review)),
}

// ── Cart ──────────────────────────────────────────────────────────────────────

export const cart = {
  get: async (fulfilment: FulfilmentType = 'delivery') => unwrap(await http.get<ApiItem<Cart>>('/cart', { params: { fulfilment_type: fulfilment } })),
  add: async (item: AddCartItemRequest) => unwrap(await http.post<ApiItem<Cart>>('/cart/items', item)),
  /** quantity 0 removes the line. */
  setQuantity: async (lineId: number, quantity: number) => unwrap(await http.patch<ApiItem<Cart>>(`/cart/items/${lineId}`, { quantity })),
  remove: async (lineId: number) => unwrap(await http.delete<ApiItem<Cart>>(`/cart/items/${lineId}`)),
  clear: async () => unwrap(await http.delete<ApiItem<Cart>>('/cart')),
  applyCoupon: async (code: string) => unwrap(await http.post<ApiItem<Cart>>('/cart/coupon', { code })),
  removeCoupon: async () => unwrap(await http.delete<ApiItem<Cart>>('/cart/coupon')),

  /**
   * Makes the server cart match the storefront's local cart (CartContext lines), e.g.
   * right before checkout. The server re-prices everything; local prices are not sent.
   */
  async syncFromLocal(lines: { productId: string; quantity: number }[]): Promise<Cart> {
    let current = await this.clear()
    for (const line of lines) {
      if (line.quantity > 0) current = await this.add({ product_slug: line.productId, quantity: line.quantity })
    }
    return current
  },
}

// ── Addresses ─────────────────────────────────────────────────────────────────

export const addresses = {
  list: async () => (await http.get<{ data: Address[] }>('/addresses')).data.data,
  create: async (address: AddressInput & { is_default?: boolean }) => unwrap(await http.post<ApiItem<Address>>('/addresses', address)),
  update: async (id: number, changes: Partial<AddressInput> & { is_default?: boolean }) => unwrap(await http.patch<ApiItem<Address>>(`/addresses/${id}`, changes)),
  remove: async (id: number) => {
    await http.delete(`/addresses/${id}`)
  },
}

// ── Orders ────────────────────────────────────────────────────────────────────

export const orders = {
  /**
   * Places an order from the server cart. Pass the same idempotencyKey when retrying
   * one checkout (double click, network retry): the server returns the original order.
   */
  async place(payload: PlaceOrderRequest, idempotencyKey: string = crypto.randomUUID()): Promise<PlaceOrderResponse> {
    return (await http.post<PlaceOrderResponse>('/orders', payload, { headers: { 'Idempotency-Key': idempotencyKey } })).data
  },
  list: async (page = 1) => (await http.get<Paginated<Order>>('/orders', { params: { page } })).data,
  get: async (orderNumber: string) => unwrap(await http.get<ApiItem<Order>>(`/orders/${encodeURIComponent(orderNumber)}`)),
  cancel: async (orderNumber: string, reason?: string) => unwrap(await http.post<ApiItem<Order>>(`/orders/${encodeURIComponent(orderNumber)}/cancel`, { reason })),

  /**
   * After PayHere sends the shopper back to return_url, wait for the server-side
   * notification to land. Resolves with the order once payment is no longer pending.
   */
  async waitForPayment(orderNumber: string, { intervalMs = 2500, timeoutMs = 60_000 } = {}): Promise<Order> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const order = await this.get(orderNumber)
      if (order.payment_status !== 'pending' || Date.now() > deadline) return order
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
  },
}

// ── Payments ──────────────────────────────────────────────────────────────────

export const payments = {
  startPayHere: async (orderNumber: string) => unwrap(await http.post<ApiItem<PayHereCheckout>>('/payments/payhere', { order_number: orderNumber })),
  get: async (reference: string) => unwrap(await http.get<ApiItem<Payment>>(`/payments/${encodeURIComponent(reference)}`)),

  /**
   * Sends the browser to PayHere's hosted checkout with the server-signed fields.
   * (Alternative: load https://www.payhere.lk/lib/payhere.js and call
   * payhere.startPayment({ ...checkout.fields, sandbox: checkout.sandbox }).)
   */
  redirectToPayHere(checkout: PayHereCheckout): void {
    const form = document.createElement('form')
    form.method = checkout.method
    form.action = checkout.action_url
    form.style.display = 'none'
    for (const [name, value] of Object.entries(checkout.fields)) {
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = name
      input.value = value
      form.appendChild(input)
    }
    document.body.appendChild(form)
    form.submit()
  },
}

export const notifications = {
  list: async (unreadOnly = false) => (await http.get<Paginated<AppNotification> & { meta: { unread_count: number } }>('/notifications', { params: { unread: unreadOnly ? 1 : undefined } })).data,
  markRead: async (id: string) => unwrap(await http.post<ApiItem<AppNotification>>(`/notifications/${id}/read`)),
  markAllRead: async () => {
    await http.post('/notifications/read-all')
  },
}

// ── Adapters for the existing storefront types ────────────────────────────────

/**
 * Maps an API product onto the storefront's existing `Product` shape
 * (src/data/products.ts), so ProductCard, Menu and the cart keep working unchanged.
 */
export function toStorefrontProduct(p: Product) {
  return {
    id: p.slug,
    name: p.name,
    description: p.description ?? '',
    price: p.price,
    image: p.image?.url ?? `/images/products/${p.slug}-800.webp`,
    imageAlt: p.image?.alt ?? p.name,
    categories: p.categories.map((c) => c.slug) as ('beef' | 'chicken' | 'spicy' | 'plant')[],
    badge: (p.badge ?? undefined) as 'Signature' | 'Hot' | 'Plant-based' | 'For two' | undefined,
  }
}
