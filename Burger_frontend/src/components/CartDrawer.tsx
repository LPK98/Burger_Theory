import { CircleCheck, ShoppingBag, Trash, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAuth, useAuthActions } from '../hooks/useAuth'
import { useCart, useCartActions } from '../hooks/useCart'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useLenis } from '../hooks/useLenis'
import { gsap, useGSAP } from '../lib/gsap'
import { formatPrice, prefersReducedMotion } from '../lib/utils'
import type { Order } from '../services/api/types'
import { Button } from './Button'
import { CheckoutForm } from './CheckoutForm'
import { QuantityStepper } from './QuantityStepper'

export function CartDrawer() {
  const { items, count, subtotal, isOpen } = useCart()
  const { open, close, setQuantity, remove, clear } = useCartActions()
  const { lock, unlock, scrollTo } = useLenis()
  const { status: authStatus, user } = useAuth()
  const { openDialog } = useAuthActions()

  const root = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const firstRun = useRef(true)

  // cart → checkout (signed in) → placed (cash orders; online ones leave for the payment page).
  const [step, setStep] = useState<'cart' | 'checkout'>('cart')
  const [placed, setPlaced] = useState<Order | null>(null)
  const inCheckout = step === 'checkout' && authStatus === 'signed-in' && items.length > 0

  useFocusTrap(panel, isOpen, close)

  // Lock the page behind the drawer and manage focus in and out.
  useEffect(() => {
    if (!isOpen) return
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    lock()
    const timer = window.setTimeout(() => closeButton.current?.focus(), 80)
    return () => {
      window.clearTimeout(timer)
      unlock()
      setStep('cart')
      setPlaced(null)
      returnFocus.current?.focus({ preventScroll: true })
    }
  }, [isOpen, lock, unlock])

  useGSAP(
    () => {
      const overlay = root.current?.querySelector('[data-overlay]')
      if (firstRun.current) {
        firstRun.current = false
        gsap.set(panel.current, { xPercent: 100 })
        gsap.set(overlay ?? [], { autoAlpha: 0 })
        if (!isOpen) return
      }
      const speed = prefersReducedMotion() ? 0 : 1
      if (isOpen) {
        gsap.set(root.current, { visibility: 'visible' })
        gsap.to(overlay ?? [], { autoAlpha: 1, duration: 0.45 * speed, ease: 'power2.out', overwrite: true })
        gsap.to(panel.current, { xPercent: 0, duration: 0.8 * speed, ease: 'expo.out', overwrite: true })
        const lines = root.current?.querySelectorAll('[data-cart-line]')
        if (lines?.length) {
          gsap.from(lines, { x: 36, autoAlpha: 0, duration: 0.7 * speed, ease: 'power3.out', stagger: 0.05, delay: 0.12 * speed })
        }
      } else {
        gsap.to(panel.current, { xPercent: 100, duration: 0.5 * speed, ease: 'power3.in', overwrite: true })
        gsap.to(overlay ?? [], {
          autoAlpha: 0,
          duration: 0.4 * speed,
          delay: 0.1 * speed,
          overwrite: true,
          onComplete: () => {
            gsap.set(root.current, { visibility: 'hidden' })
          },
        })
      }
    },
    { scope: root, dependencies: [isOpen] },
  )

  // Scrolling has to wait until the drawer has released the page's scroll lock.
  const browseAfterClose = useRef(false)
  useEffect(() => {
    if (isOpen || !browseAfterClose.current) return
    browseAfterClose.current = false
    scrollTo('#menu')
  }, [isOpen, scrollTo])

  const browseMenu = () => {
    browseAfterClose.current = true
    close()
  }

  /**
   * Guests can build a cart but need an account to order. The cart steps aside for the
   * sign-up dialog and comes back when it closes, signed in or not.
   */
  const requireAccount = (view: 'signup' | 'login') => {
    close()
    openDialog(view, { intent: 'checkout', onClose: open })
  }

  const checkout = () => {
    if (authStatus !== 'signed-in') return requireAccount('signup')
    setStep('checkout')
  }

  const onPlaced = (order: Order) => {
    setPlaced(order)
    setStep('cart')
    clear()
  }

  return (
    <div ref={root} className="invisible fixed inset-0 z-[70]" inert={!isOpen}>
      <div data-overlay className="absolute inset-0 bg-black/70" onClick={close} aria-hidden="true" />
      <aside
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-title"
        className="absolute right-0 top-0 flex h-full w-full max-w-[30rem] flex-col border-l border-line bg-char shadow-[-30px_0_80px_-20px_rgba(0,0,0,0.8)]"
      >
        <header className="flex items-center justify-between gap-4 border-b border-line px-6 py-5">
          <h2 id="cart-title" className="display text-[2.6rem] text-cream">
            {placed ? (
              'Order placed'
            ) : inCheckout ? (
              'Checkout'
            ) : (
              <>
                Your cart <span className="text-ember">{count > 0 ? `(${count})` : ''}</span>
              </>
            )}
          </h2>
          <button
            ref={closeButton}
            type="button"
            onClick={close}
            aria-label="Close cart"
            className="grid h-11 w-11 place-items-center rounded-full border border-cream/20 text-cream transition-colors hover:border-ember hover:text-ember"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        {placed ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 px-10 text-center" role="status">
            <CircleCheck className="h-10 w-10 text-ember" aria-hidden="true" />
            <p className="display text-[2.2rem] text-cream">Thanks{user ? `, ${user.name.split(' ')[0]}` : ''}!</p>
            <p className="max-w-[34ch] text-bone/80">
              Order <span className="text-cream">{placed.order_number}</span> is with the kitchen. You’ll pay {formatPrice(placed.total)}{' '}
              {placed.fulfilment_type === 'delivery' ? 'when it arrives' : 'when you collect it'}, and we’ll email you as it moves along.
            </p>
            <Button onClick={browseMenu}>Back to the menu</Button>
          </div>
        ) : inCheckout ? (
          <CheckoutForm items={items} onBack={() => setStep('cart')} onPlaced={onPlaced} />
        ) : items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 px-10 text-center">
            <ShoppingBag className="h-10 w-10 text-ember" aria-hidden="true" />
            <p className="display text-[2.2rem] text-cream">Nothing here yet</p>
            <p className="max-w-[30ch] text-bone/70">Pick a burger from the menu and it will wait for you here.</p>
            <Button onClick={browseMenu}>Browse the menu</Button>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-line overflow-y-auto overscroll-contain px-6" data-lenis-prevent>
              {items.map((item) => (
                <li key={item.productId} data-cart-line className="flex gap-4 py-5">
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[3px] bg-ink">
                    <img src={item.product.image} alt="" width={1000} height={1000} className="absolute left-[-6%] top-[-22%] w-[112%] max-w-none" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="display truncate text-[1.6rem] text-cream [font-stretch:68%]">{item.product.name}</p>
                        <p className="ui text-sm text-ash">{formatPrice(item.product.price)} each</p>
                      </div>
                      <p className="ui tabular text-base text-bone">{formatPrice(item.lineTotal)}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <QuantityStepper size="sm" name={item.product.name} quantity={item.quantity} onChange={(q) => setQuantity(item.productId, q)} />
                      <button
                        type="button"
                        onClick={() => remove(item.productId)}
                        className="ui inline-flex items-center gap-1.5 text-sm text-ash transition-colors hover:text-ember"
                        aria-label={`Remove ${item.product.name} from cart`}
                      >
                        <Trash className="h-4 w-4" aria-hidden="true" />
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <footer className="border-t border-line px-6 pb-6 pt-5">
              <dl className="flex items-baseline justify-between">
                <dt className="ui text-ash">Subtotal</dt>
                <dd className="display tabular text-[2.4rem] text-bone">{formatPrice(subtotal)}</dd>
              </dl>
              <p className="mt-1 text-sm text-ash">Delivery and any discounts are worked out at checkout.</p>
              {authStatus === 'signed-in' ? (
                <>
                  <Button size="lg" className="mt-5 w-full" onClick={checkout}>
                    Checkout
                  </Button>
                  {user && (
                    <p className="ui mt-3 truncate text-center text-sm text-ash">
                      Ordering as <span className="text-cream">{user.name}</span>
                    </p>
                  )}
                </>
              ) : authStatus === 'checking' ? (
                <Button size="lg" className="mt-5 w-full" disabled>
                  Checking your account…
                </Button>
              ) : (
                <>
                  <Button size="lg" className="mt-5 w-full" onClick={() => requireAccount('signup')}>
                    Sign up to order
                  </Button>
                  <p className="ui mt-3 text-center text-sm text-ash">
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => requireAccount('login')}
                      className="text-ember underline-offset-4 transition-colors hover:text-ember-hot hover:underline"
                    >
                      Log in
                    </button>
                  </p>
                </>
              )}
              <button type="button" onClick={clear} className="ui mt-4 text-sm text-ash underline-offset-4 transition-colors hover:text-ember hover:underline">
                Empty cart
              </button>
            </footer>
          </>
        )}
      </aside>
    </div>
  )
}
