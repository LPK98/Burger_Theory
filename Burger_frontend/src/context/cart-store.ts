import { createContext } from 'react'
import type { Product } from '../data/products'

/** Shared cart types and context objects (kept apart from the provider for fast refresh). */

export const MAX_QUANTITY = 20

export interface CartLine {
  productId: string
  quantity: number
}

export interface CartItem extends CartLine {
  product: Product
  /** In cents. */
  lineTotal: number
}

export interface CartStateValue {
  items: CartItem[]
  count: number
  /** In cents. */
  subtotal: number
  isOpen: boolean
  /** Bumps every time something is added; drives the confirmation toast. */
  lastAdded: { productId: string; at: number } | null
  quantityOf: (productId: string) => number
}

export interface CartActionsValue {
  add: (productId: string, quantity?: number) => void
  setQuantity: (productId: string, quantity: number) => void
  remove: (productId: string) => void
  clear: () => void
  open: () => void
  close: () => void
}

export const CartStateContext = createContext<CartStateValue | null>(null)
/** Actions live in their own context so components that only dispatch never re-render on cart changes. */
export const CartActionsContext = createContext<CartActionsValue | null>(null)
