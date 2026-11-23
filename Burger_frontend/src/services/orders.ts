import { auth } from './api/client'

/**
 * Ordering service — BACKEND INTEGRATION POINT
 * --------------------------------------------
 * Ordering needs an account. The cart sends guests to sign up before they get here,
 * this function refuses guests as a second line, and the API's POST /orders requires
 * a Sanctum token as the real gate.
 *
 * Order placement itself isn't wired to the API yet: the storefront menu is priced in
 * USD cents while the API prices in LKR (e.g. 1450 vs 145000 for the Theory Classic),
 * so the menu and currency have to be aligned first. backend/docs/FRONTEND_INTEGRATION.md
 * section 5 has a drop-in body for this function (cart.syncFromLocal + orders.place).
 *
 * Until then:
 *   1. Set VITE_ORDER_API_URL in `.env.local` (see `.env.example`).
 *   2. Replace the body of `submitOrder` with the request below, adding auth/payment as needed.
 *   3. Map the response onto `OrderResult` (e.g. { status: 'accepted', orderId }).
 *
 *   const response = await fetch(`${import.meta.env.VITE_ORDER_API_URL}/orders`, {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify(order),
 *   })
 */

export interface OrderLine {
  productId: string
  name: string
  quantity: number
  /** Unit price in cents. */
  unitPrice: number
}

export interface OrderRequest {
  lines: OrderLine[]
  /** In cents. */
  subtotal: number
  currency: string
}

export type OrderResult = { status: 'accepted'; orderId: string } | { status: 'unavailable'; message: string }

export async function submitOrder(order: OrderRequest): Promise<OrderResult> {
  if (!auth.isSignedIn()) {
    return { status: 'unavailable', message: 'Please sign up or log in to place an order.' }
  }
  const endpoint = import.meta.env.VITE_ORDER_API_URL as string | undefined
  if (!endpoint) {
    return {
      status: 'unavailable',
      message: 'Online ordering isn’t connected yet, so nothing has been charged or sent to the kitchen.',
    }
  }
  // Placeholder for the real call. Kept unreachable until an endpoint is configured.
  void order
  return {
    status: 'unavailable',
    message: 'An order endpoint is configured but the request isn’t implemented yet. See src/services/orders.ts.',
  }
}
