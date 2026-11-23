import { ApiError, auth, cart, orders, payments } from './api/client'
import type { AddressInput, Cart, FulfilmentType, Order, PaymentMethod } from './api/types'

/**
 * Checkout: turns the storefront's local cart into an API order and, for online payment,
 * sends the browser to the payment provider's hosted page.
 *
 * Prices never travel from here. The local cart is copied to the server cart (product ids
 * and quantities only), and the API prices it, applies delivery fees and minimums, and
 * creates the order. Stripe/PayHere then charge exactly the amount the server stored.
 */

export interface CheckoutLine {
  productId: string
  quantity: number
}

export type DeliveryAddress = Pick<AddressInput, 'recipient_name' | 'phone' | 'line1' | 'city'> & { line2?: string | null }

export interface CheckoutDetails {
  fulfilment: FulfilmentType
  paymentMethod: PaymentMethod
  /** Required for delivery. */
  address?: DeliveryAddress
  saveAddress?: boolean
  notes?: string
}

export type CheckoutOutcome =
  /** The browser is on its way to Stripe or PayHere. */
  | { status: 'redirecting'; orderNumber: string }
  /** Cash order: nothing left to do online. */
  | { status: 'placed'; order: Order }

/**
 * Copying the cart is "clear, then add each line", so two copies running at once would
 * interleave and double the server cart. Every cart write goes through this queue.
 */
let cartQueue: Promise<unknown> = Promise.resolve()
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = cartQueue.then(task, task)
  cartQueue = run.catch(() => undefined)
  return run
}

/** Copies the local cart to the server and returns the server's priced quote. */
export function quoteCart(lines: CheckoutLine[], fulfilment: FulfilmentType): Promise<Cart> {
  return serial(async () => {
    await cart.syncFromLocal(lines)
    return cart.get(fulfilment)
  })
}

/**
 * Places the order. Use one `idempotencyKey` per checkout attempt and reuse it when the
 * shopper retries after an error, so a retry can never create a second order.
 */
export async function placeOrder(lines: CheckoutLine[], details: CheckoutDetails, idempotencyKey: string): Promise<CheckoutOutcome> {
  if (!auth.isSignedIn()) throw new ApiError('Please log in to place an order.', 401, 'unknown')

  const placed = await serial(async () => {
    await cart.syncFromLocal(lines)
    return orders.place(
      {
        fulfilment_type: details.fulfilment,
        payment_method: details.paymentMethod,
        ...(details.fulfilment === 'delivery' && details.address
          ? { address: { ...details.address, line2: details.address.line2 || null }, save_address: details.saveAddress ?? false }
          : {}),
        ...(details.notes?.trim() ? { notes: details.notes.trim() } : {}),
      },
      idempotencyKey,
    )
  })

  const order = placed.data
  if (placed.meta.next_action === 'stripe_checkout' || placed.meta.next_action === 'payhere_checkout') {
    await payOnline(order.order_number, order.payment_method)
    return { status: 'redirecting', orderNumber: order.order_number }
  }
  return { status: 'placed', order }
}

/**
 * Sends the browser to the hosted payment page for an unpaid online order (first attempt or
 * a retry after a cancelled/failed one). Card details are only ever entered there.
 */
export async function payOnline(orderNumber: string, method: PaymentMethod): Promise<void> {
  if (method === 'stripe') {
    const checkout = await payments.startStripe(orderNumber)
    window.location.assign(checkout.url)
    return
  }
  if (method === 'payhere') {
    payments.redirectToPayHere(await payments.startPayHere(orderNumber))
    return
  }
  throw new ApiError('This order is paid in cash.', 409, 'unknown')
}

/**
 * The order as it stands after the shopper returns from the payment page. For Stripe the
 * server first asks Stripe for the session, so the result is current even if the webhook
 * hasn't arrived yet; then it waits briefly for a still-pending payment to settle.
 */
export async function orderAfterReturn(orderNumber: string, { waitMs = 15_000 } = {}): Promise<Order> {
  let order = await orders.get(orderNumber)
  if (order.payment_method === 'stripe' && order.payment_status !== 'paid' && order.can_pay_online) {
    try {
      order = await payments.confirmStripe(orderNumber)
    } catch {
      // The webhook still settles it; fall back to polling below.
    }
  }
  if (order.payment_status === 'pending' && order.can_pay_online && waitMs > 0) {
    order = await orders.waitForPayment(orderNumber, { intervalMs: 2500, timeoutMs: waitMs })
  }
  return order
}

/** A message for the shopper from any API error, with field errors flattened. */
export function checkoutErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.'
  const fields = Object.values(error.fieldErrors).flat()
  if (fields.length) return fields.join(' ')
  return error.message
}
