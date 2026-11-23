import { useContext } from 'react'
import { CartActionsContext, CartStateContext } from '../context/cart-store'

export function useCart() {
  const value = useContext(CartStateContext)
  if (!value) throw new Error('useCart must be used inside <CartProvider>.')
  return value
}

export function useCartActions() {
  const value = useContext(CartActionsContext)
  if (!value) throw new Error('useCartActions must be used inside <CartProvider>.')
  return value
}
