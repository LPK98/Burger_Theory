import { useEffect, useMemo, useReducer, type ReactNode } from 'react'
import { PRODUCTS_BY_ID } from '../data/products'
import { CartActionsContext, CartStateContext, MAX_QUANTITY, type CartActionsValue, type CartLine, type CartStateValue } from './cart-store'

const STORAGE_KEY = 'burger-theory:cart:v1'
/** Key used before the rename to Burger Theory; read once so saved carts carry over. */
const LEGACY_STORAGE_KEY = 'bun-theory:cart:v1'

interface CartState {
  lines: CartLine[]
  isOpen: boolean
  lastAdded: CartStateValue['lastAdded']
}

type CartAction =
  | { type: 'add'; productId: string; quantity: number }
  | { type: 'set'; productId: string; quantity: number }
  | { type: 'remove'; productId: string }
  | { type: 'clear' }
  | { type: 'open' }
  | { type: 'close' }

const clamp = (n: number) => Math.max(0, Math.min(MAX_QUANTITY, Math.round(n)))

function reducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'add': {
      if (!PRODUCTS_BY_ID[action.productId]) return state
      const existing = state.lines.find((l) => l.productId === action.productId)
      const lines = existing
        ? state.lines.map((l) => (l.productId === action.productId ? { ...l, quantity: clamp(l.quantity + action.quantity) } : l))
        : [...state.lines, { productId: action.productId, quantity: clamp(action.quantity) }]
      return { ...state, lines, lastAdded: { productId: action.productId, at: Date.now() } }
    }
    case 'set': {
      const quantity = clamp(action.quantity)
      if (quantity === 0) return { ...state, lines: state.lines.filter((l) => l.productId !== action.productId) }
      return { ...state, lines: state.lines.map((l) => (l.productId === action.productId ? { ...l, quantity } : l)) }
    }
    case 'remove':
      return { ...state, lines: state.lines.filter((l) => l.productId !== action.productId) }
    case 'clear':
      return { ...state, lines: [] }
    case 'open':
      return { ...state, isOpen: true }
    case 'close':
      return { ...state, isOpen: false }
  }
}

/** Restores a saved cart, dropping anything that no longer matches the menu. */
function loadLines(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (l): l is CartLine =>
          typeof l === 'object' && l !== null && typeof l.productId === 'string' && Number.isInteger(l.quantity) && l.quantity > 0,
      )
      .filter((l) => PRODUCTS_BY_ID[l.productId])
      .map((l) => ({ productId: l.productId, quantity: clamp(l.quantity) }))
  } catch {
    return []
  }
}

/**
 * Frontend-only cart: a reducer persisted to localStorage. Checkout goes through
 * src/services/orders.ts, which is where a real ordering backend will plug in.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({ lines: loadLines(), isOpen: false, lastAdded: null }))

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.lines))
      window.localStorage.removeItem(LEGACY_STORAGE_KEY)
    } catch {
      // Storage can be unavailable (private mode, quota). The cart still works for this visit.
    }
  }, [state.lines])

  const actions = useMemo<CartActionsValue>(
    () => ({
      add: (productId, quantity = 1) => dispatch({ type: 'add', productId, quantity }),
      setQuantity: (productId, quantity) => dispatch({ type: 'set', productId, quantity }),
      remove: (productId) => dispatch({ type: 'remove', productId }),
      clear: () => dispatch({ type: 'clear' }),
      open: () => dispatch({ type: 'open' }),
      close: () => dispatch({ type: 'close' }),
    }),
    [],
  )

  const value = useMemo<CartStateValue>(() => {
    const items = state.lines.map((line) => {
      const product = PRODUCTS_BY_ID[line.productId]
      return { ...line, product, lineTotal: product.price * line.quantity }
    })
    const quantities = new Map(state.lines.map((l) => [l.productId, l.quantity]))
    return {
      items,
      count: items.reduce((n, i) => n + i.quantity, 0),
      subtotal: items.reduce((sum, i) => sum + i.lineTotal, 0),
      isOpen: state.isOpen,
      lastAdded: state.lastAdded,
      quantityOf: (productId) => quantities.get(productId) ?? 0,
    }
  }, [state])

  return (
    <CartActionsContext.Provider value={actions}>
      <CartStateContext.Provider value={value}>{children}</CartStateContext.Provider>
    </CartActionsContext.Provider>
  )
}
