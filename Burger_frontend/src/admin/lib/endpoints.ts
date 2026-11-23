import { get, http, send } from './api'
import type {
  AdminPayment,
  AdminUser,
  Category,
  ConsumptionReport,
  Coupon,
  CouponInput,
  Customer,
  CustomerDetail,
  DashboardSummary,
  Ingredient,
  IngredientMovement,
  Interval,
  Item,
  MovementReason,
  Order,
  OrderStatistics,
  OrderStatus,
  Paginated,
  PaymentSummary,
  Product,
  ProductImage,
  ProductInput,
  ProductStockLog,
  SalesReport,
  BestSeller,
  OpeningHoursAdmin,
  OpeningHoursUpdate,
  Settings,
  SettingsResponse,
  SpecialDate,
  SpecialDateInput,
  StockStatus,
  Unit,
} from './types'

const enc = encodeURIComponent

export const auth = {
  login: async (email: string, password: string) =>
    (await send<Item<{ user: AdminUser; token: string }>>('post', '/admin/login', { email, password, device_name: 'admin-portal' })).data,
  me: async () => (await get<Item<AdminUser>>('/user')).data,
  logout: () => send<void>('post', '/logout'),
  updateProfile: async (changes: { name?: string; email?: string; phone?: string | null }) => (await send<Item<AdminUser>>('patch', '/user', changes)).data,
  changePassword: (current_password: string, password: string, password_confirmation: string) =>
    send<{ message: string }>('put', '/user/password', { current_password, password, password_confirmation }),
}

export const dashboard = {
  summary: async () => (await get<Item<DashboardSummary>>('/admin/dashboard')).data,
}

export const reports = {
  sales: async (params: { interval: Interval; from?: string; to?: string }) => (await get<Item<SalesReport>>('/admin/reports/sales', params)).data,
  orders: async (params: { from?: string; to?: string }) => (await get<Item<OrderStatistics>>('/admin/reports/orders', params)).data,
  bestSellers: async (params: { from?: string; to?: string; limit?: number }) => (await get<Item<BestSeller[]>>('/admin/reports/best-sellers', params)).data,
}

export interface ProductFilters {
  search?: string
  category?: string
  is_available?: '1' | '0'
  stock_status?: string
  with_trashed?: '1'
  page?: number
  per_page?: number
}

export const products = {
  list: (filters: ProductFilters) => get<Paginated<Product>>('/admin/products', filters as Record<string, unknown>),
  get: async (id: number) => (await get<Item<Product>>(`/admin/products/${id}`)).data,
  create: async (input: ProductInput) => (await send<Item<Product>>('post', '/admin/products', input)).data,
  update: async (id: number, input: Partial<ProductInput>) => (await send<Item<Product>>('patch', `/admin/products/${id}`, input)).data,
  remove: (id: number) => send<void>('delete', `/admin/products/${id}`),
  restore: async (id: number) => (await send<Item<Product>>('post', `/admin/products/${id}/restore`)).data,
  uploadImage: async (id: number, file: File, altText?: string) => {
    const form = new FormData()
    form.append('image', file)
    if (altText) form.append('alt_text', altText)
    return (await http.post<Item<ProductImage>>(`/admin/products/${id}/images`, form)).data.data
  },
  makePrimary: async (id: number, imageId: number) => (await send<Item<ProductImage>>('patch', `/admin/products/${id}/images/${imageId}`, { is_primary: true })).data,
  deleteImage: (id: number, imageId: number) => send<void>('delete', `/admin/products/${id}/images/${imageId}`),
  stockLog: (id: number) => get<Paginated<ProductStockLog>>(`/admin/products/${id}/stock`, { per_page: 15 }),
  adjustStock: (id: number, body: { change?: number; set_to?: number; reason: 'restock' | 'adjustment'; note?: string }) =>
    send<Item<{ product: Product }>>('post', `/admin/products/${id}/stock`, body),
  saveRecipe: async (id: number, items: { ingredient_id: number; quantity: number }[]) => (await send<Item<Product>>('put', `/admin/products/${id}/recipe`, { items })).data,
}

export const categories = {
  list: async () => (await get<{ data: Category[] }>('/admin/categories')).data,
  create: async (input: Partial<Category>) => (await send<Item<Category>>('post', '/admin/categories', input)).data,
  update: async (id: number, input: Partial<Category>) => (await send<Item<Category>>('patch', `/admin/categories/${id}`, input)).data,
  remove: (id: number) => send<void>('delete', `/admin/categories/${id}`),
}

export interface OrderFilters {
  status?: string
  payment_status?: string
  payment_method?: string
  fulfilment_type?: string
  customer_id?: number
  date_from?: string
  date_to?: string
  search?: string
  sort?: string
  page?: number
  per_page?: number
}

export const orders = {
  list: (filters: OrderFilters) => get<Paginated<Order>>('/admin/orders', filters as Record<string, unknown>),
  get: async (number: string) => (await get<Item<Order>>(`/admin/orders/${enc(number)}`)).data,
  setStatus: async (number: string, status: OrderStatus, note?: string) =>
    (await send<Item<Order>>('patch', `/admin/orders/${enc(number)}/status`, { status, note: note || undefined })).data,
  collectCash: async (number: string) => (await send<Item<Order>>('post', `/admin/orders/${enc(number)}/cod-collection`)).data,
}

export const customers = {
  list: (filters: { search?: string; sort?: string; has_orders?: '1' | '0'; page?: number; per_page?: number }) => get<Paginated<Customer>>('/admin/customers', filters),
  get: async (id: number) => (await get<Item<CustomerDetail>>(`/admin/customers/${id}`)).data,
}

export const payments = {
  list: (filters: { method?: string; status?: string; date_from?: string; date_to?: string; search?: string; page?: number; per_page?: number }) =>
    get<Paginated<AdminPayment> & { meta: { summary: PaymentSummary } }>('/admin/payments', filters),
  get: async (reference: string) => (await get<Item<AdminPayment>>(`/admin/payments/${enc(reference)}`)).data,
}

export const inventory = {
  list: async (params: { search?: string; status?: StockStatus | ''; sort?: 'name' | 'urgency' }) => (await get<{ data: Ingredient[] }>('/admin/ingredients', params)).data,
  get: async (id: number) => (await get<Item<Ingredient>>(`/admin/ingredients/${id}`)).data,
  create: async (input: { name: string; unit: Unit; stock_quantity?: number; min_stock_level?: number; notes?: string | null }) =>
    (await send<Item<Ingredient>>('post', '/admin/ingredients', input)).data,
  update: async (id: number, input: { name?: string; min_stock_level?: number; notes?: string | null }) => (await send<Item<Ingredient>>('patch', `/admin/ingredients/${id}`, input)).data,
  remove: (id: number) => send<void>('delete', `/admin/ingredients/${id}`),
  adjust: (id: number, body: { reason: 'restock' | 'adjustment' | 'waste'; change?: number; set_to?: number; note?: string }) =>
    send<Item<{ ingredient: Ingredient; movement: IngredientMovement }>>('post', `/admin/ingredients/${id}/adjustments`, body),
  movements: (params: { ingredient_id?: number; reason?: MovementReason | ''; date_from?: string; date_to?: string; page?: number; per_page?: number }) =>
    get<Paginated<IngredientMovement>>('/admin/inventory/movements', params),
  consumption: async (params: { from?: string; to?: string }) => (await get<Item<ConsumptionReport>>('/admin/inventory/consumption', params)).data,
}

export const coupons = {
  list: (filters: { search?: string; is_active?: '1' | '0'; page?: number; per_page?: number }) => get<Paginated<Coupon>>('/admin/coupons', filters),
  create: async (input: Partial<CouponInput>) => (await send<Item<Coupon>>('post', '/admin/coupons', input)).data,
  update: async (id: number, input: Partial<CouponInput>) => (await send<Item<Coupon>>('patch', `/admin/coupons/${id}`, input)).data,
  remove: (id: number) => send<void>('delete', `/admin/coupons/${id}`),
}

export const openingHours = {
  get: async () => (await get<Item<OpeningHoursAdmin>>('/admin/opening-hours')).data,
  update: async (changes: OpeningHoursUpdate) => (await send<Item<OpeningHoursAdmin>>('put', '/admin/opening-hours', changes)).data,
  createSpecial: async (input: SpecialDateInput) => (await send<Item<SpecialDate>>('post', '/admin/opening-hours/special-dates', input)).data,
  updateSpecial: async (id: number, input: Partial<SpecialDateInput>) => (await send<Item<SpecialDate>>('patch', `/admin/opening-hours/special-dates/${id}`, input)).data,
  removeSpecial: (id: number) => send<void>('delete', `/admin/opening-hours/special-dates/${id}`),
}

export const settings = {
  get: () => get<SettingsResponse>('/admin/settings'),
  update: (changes: Partial<Settings>) => send<SettingsResponse>('patch', '/admin/settings', changes),
  uploadLogo: async (file: File) => {
    const form = new FormData()
    form.append('logo', file)
    return (await http.post<SettingsResponse>('/admin/settings/logo', form)).data
  },
  removeLogo: () => send<SettingsResponse>('delete', '/admin/settings/logo'),
}
