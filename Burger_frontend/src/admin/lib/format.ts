import type { MovementReason, OrderStatus, PaymentMethod, PaymentStatus, Unit } from './types'

export const TIMEZONE = 'Asia/Colombo'

/** The restaurant's currency (the API's `currency`). Money from the API is integer cents of it. */
export const CURRENCY = 'USD'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: CURRENCY, minimumFractionDigits: 2 })
const usdWhole = new Intl.NumberFormat('en-US', { style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 })
const usdCompact = new Intl.NumberFormat('en-US', { style: 'currency', currency: CURRENCY, notation: 'compact', maximumFractionDigits: 1 })
const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const qty = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 })

/** 1450 → "$14.50" */
export const money = (cents: number | null | undefined) => (cents == null ? '—' : usd.format(cents / 100))
/** 1450 → "$15" */
export const moneyWhole = (cents: number | null | undefined) => (cents == null ? '—' : usdWhole.format(Math.round(cents / 100)))
/** 246569000 → "$2.5M" (for axes and big figures) */
export const moneyCompact = (cents: number) => (Math.abs(cents) < 10_000_00 ? usdWhole.format(Math.round(cents / 100)) : usdCompact.format(cents / 100))
export const count = (n: number) => integer.format(n)
export const countCompact = (n: number) => (Math.abs(n) < 10_000 ? integer.format(n) : compact.format(n))
export const quantity = (n: number, unit?: Unit) => `${qty.format(n)}${unit ? ` ${unit}` : ''}`
export const percent = (ratio: number, digits = 1) => `${(ratio * 100).toFixed(digits)}%`

/** Dollars typed in a form ("1,450.50" or "$14.50") → cents (145050 / 1450). Returns null when blank or invalid. */
export function dollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[,\s]/g, '').replace(/^(us)?\$/i, '')
  if (cleaned === '' || !/^\d+(\.\d{0,2})?$/.test(cleaned)) return null
  const [whole, fraction = ''] = cleaned.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

export const centsToDollars = (cents: number | null | undefined) => (cents == null ? '' : (cents / 100).toFixed(2).replace(/\.00$/, ''))

const dateFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, day: 'numeric', month: 'short', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false })

export const date = (iso: string | null | undefined) => (iso ? dateFmt.format(new Date(iso)) : '—')
export const dateTime = (iso: string | null | undefined) => (iso ? dateTimeFmt.format(new Date(iso)) : '—')
export const time = (iso: string | null | undefined) => (iso ? timeFmt.format(new Date(iso)) : '—')

/** "4 min ago", "2 h ago", "3 days ago", then a date. */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—'
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  return date(iso)
}

/** Today in the restaurant's timezone as YYYY-MM-DD. */
export function todayLocal(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

/** Labels for a report period key ("2026-11-22", "2026-11"). */
export function periodLabel(period: string, interval: 'day' | 'week' | 'month', long = false): string {
  const [y, m, d] = period.split('-').map(Number)
  const at = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12))
  if (interval === 'month') return new Intl.DateTimeFormat('en-GB', { month: long ? 'long' : 'short', year: 'numeric', timeZone: 'UTC' }).format(at)
  const label = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC', ...(long ? { weekday: 'short' } : {}) }).format(at)
  return interval === 'week' ? (long ? `Week of ${label}` : label) : label
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
}

/** The action that moves an order into this status. */
export const ORDER_STATUS_ACTION: Record<OrderStatus, string> = {
  pending: 'Mark pending',
  confirmed: 'Confirm',
  preparing: 'Start preparing',
  ready: 'Mark ready',
  out_for_delivery: 'Send out',
  delivered: 'Mark delivered',
  cancelled: 'Cancel order',
  rejected: 'Reject',
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: 'Awaiting payment',
  paid: 'Paid',
  failed: 'Failed',
  cancelled: 'Cancelled',
  charged_back: 'Charged back',
  refund_required: 'Refund required',
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  stripe: 'Stripe (card)',
  payhere: 'PayHere',
  cod: 'Cash on delivery',
}

export const MOVEMENT_REASON_LABEL: Record<MovementReason, string> = {
  consumption: 'Used by order',
  order_release: 'Returned from order',
  restock: 'Restock',
  adjustment: 'Stock count',
  waste: 'Waste',
}

export const UNIT_LABEL: Record<Unit, string> = { g: 'Grams (g)', kg: 'Kilograms (kg)', ml: 'Millilitres (ml)', l: 'Litres (l)', pcs: 'Pieces (pcs)' }
