import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PRODUCTS_BY_ID } from '../data/products'
import { useCart, useCartActions } from '../hooks/useCart'
import { cn } from '../lib/utils'

const VISIBLE_FOR = 3200

/** Confirms an add-to-cart and offers a shortcut to the cart. Announced politely to screen readers. */
export function CartToast() {
  const { lastAdded, isOpen, count } = useCart()
  const { open } = useCartActions()
  // The toast is visible until its own timer marks that particular addition as seen.
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)

  useEffect(() => {
    if (!lastAdded) return
    const timer = window.setTimeout(() => setDismissedAt(lastAdded.at), VISIBLE_FOR)
    return () => window.clearTimeout(timer)
  }, [lastAdded])

  const product = lastAdded ? PRODUCTS_BY_ID[lastAdded.productId] : null
  const visible = Boolean(lastAdded && product && dismissedAt !== lastAdded.at && !isOpen)

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-5 z-[65] flex justify-center px-4">
      <div
        className={cn(
          'flex items-center gap-4 rounded-[3px] border border-line bg-char/95 py-2.5 pl-4 pr-2.5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] transition-[opacity,transform] duration-500 ease-[var(--ease-expo)]',
          visible ? 'pointer-events-auto translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
        )}
      >
        {product && (
          <>
            <span className="grid h-7 w-7 place-items-center rounded-full bg-ember text-ink">
              <Check className="h-4 w-4" aria-hidden="true" />
            </span>
            <p className="ui text-sm text-cream">
              Added {product.name}
              <span className="sr-only">. {count} {count === 1 ? 'item' : 'items'} in your cart.</span>
            </p>
            <button
              type="button"
              tabIndex={visible ? 0 : -1}
              onClick={open}
              className="ui h-9 rounded-[3px] bg-cream/10 px-3 text-sm text-cream transition-colors hover:bg-ember hover:text-ink"
            >
              View cart
            </button>
          </>
        )}
      </div>
    </div>
  )
}
