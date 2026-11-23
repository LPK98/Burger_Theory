import { CircleAlert, CircleCheck, Clock, LoaderCircle, X } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useAuth, useAuthActions } from '../hooks/useAuth'
import { useCartActions } from '../hooks/useCart'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useLenis } from '../hooks/useLenis'
import { gsap, useGSAP } from '../lib/gsap'
import { formatPrice, prefersReducedMotion } from '../lib/utils'
import { orders } from '../services/api/client'
import type { Order } from '../services/api/types'
import { checkoutErrorMessage, orderAfterReturn, payOnline } from '../services/orders'
import { Button } from './Button'

/**
 * Shown when a payment provider sends the shopper back to the storefront:
 *   /?checkout=complete&order=BT-…   (Stripe success_url; set PAYHERE_RETURN_URL the same way)
 *   /?checkout=cancelled&order=BT-…  (cancel_url)
 *   /checkout/complete?order=BT-…    (PayHere's default return paths)
 *
 * The URL proves nothing about the payment, so the dialog asks the API, which for Stripe
 * checks with Stripe itself. The local cart is emptied only once the order is really paid.
 */

interface ReturnInfo {
  orderNumber: string
  cancelled: boolean
}

function readReturn(): ReturnInfo | null {
  const params = new URLSearchParams(window.location.search)
  const orderNumber = params.get('order')
  const flag = params.get('checkout') ?? window.location.pathname.match(/^\/checkout\/(complete|cancelled)\/?$/)?.[1] ?? null
  if (!orderNumber || (flag !== 'complete' && flag !== 'cancelled')) return null
  return { orderNumber, cancelled: flag === 'cancelled' }
}

/** Drop the flags so a reload or a shared link doesn't reopen the dialog. */
function cleanUrl() {
  window.history.replaceState(window.history.state, '', `/${window.location.hash}`)
}

type View =
  | { kind: 'checking' }
  | { kind: 'signed-out' }
  | { kind: 'paid'; order: Order }
  | { kind: 'processing'; order: Order }
  | { kind: 'unpaid'; order: Order }
  | { kind: 'cancelled'; order: Order }
  | { kind: 'error'; message: string }

function viewFor(order: Order): View {
  if (order.payment_status === 'paid') return { kind: 'paid', order }
  if (order.status === 'cancelled' || order.status === 'rejected') return { kind: 'cancelled', order }
  if (order.payment_status === 'pending') return { kind: 'processing', order }
  // Failed or abandoned: the shopper may pay again (can_pay_online) or cancel.
  return { kind: 'unpaid', order }
}

async function fetchView(info: ReturnInfo, waitMs: number): Promise<View> {
  try {
    const order = await orderAfterReturn(info.orderNumber, { waitMs })
    const next = viewFor(order)
    // Came back via "cancel" with nothing paid: say so plainly rather than "processing".
    return info.cancelled && next.kind === 'processing' ? { kind: 'unpaid', order } : next
  } catch (e) {
    return { kind: 'error', message: checkoutErrorMessage(e) }
  }
}

export function CheckoutReturnDialog() {
  const [info] = useState(readReturn)
  const [open, setOpen] = useState(info !== null)
  const [loaded, setView] = useState<View>({ kind: 'checking' })
  const [busy, setBusy] = useState<'retry' | 'cancel' | null>(null)
  const { status: authStatus } = useAuth()
  const { openDialog } = useAuthActions()
  const { clear } = useCartActions()
  const { lock, unlock } = useLenis()

  const root = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const firstRun = useRef(true)
  const titleId = useId()

  const close = useCallback(() => setOpen(false), [])
  useFocusTrap(panel, open, close)

  useEffect(() => {
    if (info) cleanUrl()
  }, [info])

  const show = useCallback(
    (next: View) => {
      setView(next)
      if (next.kind === 'paid') clear()
    },
    [clear],
  )

  useEffect(() => {
    if (!open || !info || authStatus !== 'signed-in') return
    let cancelled = false
    void fetchView(info, info.cancelled ? 0 : 15_000).then((next) => {
      if (!cancelled) show(next)
    })
    return () => {
      cancelled = true
    }
  }, [open, info, authStatus, show])

  useEffect(() => {
    if (!open) return
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    lock()
    const timer = window.setTimeout(() => closeButton.current?.focus(), 80)
    return () => {
      window.clearTimeout(timer)
      unlock()
      returnFocus?.focus({ preventScroll: true })
    }
  }, [open, lock, unlock])

  useGSAP(
    () => {
      const overlay = root.current?.querySelector('[data-overlay]') ?? []
      if (firstRun.current) {
        firstRun.current = false
        gsap.set(overlay, { autoAlpha: 0 })
        gsap.set(panel.current, { autoAlpha: 0, y: 40 })
        if (!open) return
      }
      const speed = prefersReducedMotion() ? 0 : 1
      if (open) {
        gsap.set(root.current, { visibility: 'visible' })
        gsap.to(overlay, { autoAlpha: 1, duration: 0.4 * speed, ease: 'power2.out', overwrite: true })
        gsap.to(panel.current, { autoAlpha: 1, y: 0, duration: 0.75 * speed, ease: 'expo.out', overwrite: true })
      } else {
        gsap.to(panel.current, { autoAlpha: 0, y: 24, duration: 0.35 * speed, ease: 'power2.in', overwrite: true })
        gsap.to(overlay, {
          autoAlpha: 0,
          duration: 0.35 * speed,
          delay: 0.05 * speed,
          overwrite: true,
          onComplete: () => {
            gsap.set(root.current, { visibility: 'hidden' })
          },
        })
      }
    },
    { scope: root, dependencies: [open] },
  )

  if (!info) return null
  const view: View = authStatus === 'guest' ? { kind: 'signed-out' } : loaded

  /** A button asked to look again: show the spinner, then the answer. */
  const reload = (waitMs: number) => {
    setView({ kind: 'checking' })
    void fetchView(info, waitMs).then(show)
  }

  const retry = async (order: Order) => {
    setBusy('retry')
    try {
      await payOnline(order.order_number, order.payment_method)
    } catch (e) {
      setBusy(null)
      setView({ kind: 'error', message: checkoutErrorMessage(e) })
    }
  }

  const cancelOrder = async (order: Order) => {
    setBusy('cancel')
    try {
      setView({ kind: 'cancelled', order: await orders.cancel(order.order_number, 'Payment not completed') })
    } catch (e) {
      setView({ kind: 'error', message: checkoutErrorMessage(e) })
    } finally {
      setBusy(null)
    }
  }

  const heading: Record<View['kind'], string> = {
    checking: 'Checking your payment',
    'signed-out': 'Log in to see your order',
    paid: 'Payment received',
    processing: 'Payment processing',
    unpaid: 'Payment not completed',
    cancelled: 'Order cancelled',
    error: 'We couldn’t check your order',
  }

  return (
    <div ref={root} className="invisible fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4" inert={!open}>
      <div data-overlay className="absolute inset-0 bg-black/75" onClick={close} aria-hidden="true" />
      <section
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[92dvh] w-full flex-col border-line bg-char shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)] max-sm:border-t sm:max-w-[30rem] sm:rounded-[3px] sm:border"
      >
        <header className="flex items-start justify-between gap-4 px-6 pt-6 sm:px-8 sm:pt-7">
          <div className="min-w-0">
            <p className="ui text-[0.75rem] uppercase tracking-[0.18em] text-ember">Order {info.orderNumber}</p>
            <h2 id={titleId} className="display mt-2 text-[2.6rem] text-cream">
              {heading[view.kind]}
            </h2>
          </div>
          <button
            ref={closeButton}
            type="button"
            onClick={close}
            aria-label="Close"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-cream/20 text-cream transition-colors hover:border-ember hover:text-ember"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="overflow-y-auto overscroll-contain px-6 pb-7 pt-4 sm:px-8" data-lenis-prevent role="status" aria-live="polite">
          {view.kind === 'checking' && (
            <p className="ui flex items-center gap-3 text-bone/80">
              <LoaderCircle className="h-5 w-5 animate-spin text-ember motion-reduce:animate-none" aria-hidden="true" />
              Confirming with the payment provider…
            </p>
          )}

          {view.kind === 'signed-out' && (
            <>
              <p className="text-bone/80">Your session ended while you were paying. Log in again and we’ll show you where the order stands.</p>
              <Button className="mt-6 w-full" onClick={() => openDialog('login')}>
                Log in
              </Button>
            </>
          )}

          {view.kind === 'paid' && (
            <>
              <Lead icon={<CircleCheck className="h-6 w-6 text-ember" aria-hidden="true" />}>
                We’ve received {formatPrice(view.order.total)}
                {view.order.payment?.card_mask ? ` from the card ending ${view.order.payment.card_mask.slice(-4)}` : ''}. Your order is going to the kitchen
                {view.order.fulfilment_type === 'delivery' ? ' and then out to you.' : '; we’ll let you know when it’s ready to collect.'}
              </Lead>
              <p className="ui mt-4 text-sm text-ash">A receipt is on its way to {view.order.customer.email}.</p>
              <Button className="mt-6 w-full" onClick={close}>
                Done
              </Button>
            </>
          )}

          {view.kind === 'processing' && (
            <>
              <Lead icon={<Clock className="h-6 w-6 text-ember" aria-hidden="true" />}>
                The payment provider hasn’t confirmed the payment yet. That can take a minute; we’ll email {view.order.customer.email} as soon as it’s through.
              </Lead>
              <Button variant="outline" className="mt-6 w-full" onClick={() => reload(15_000)}>
                Check again
              </Button>
            </>
          )}

          {view.kind === 'unpaid' && (
            <>
              <Lead icon={<CircleAlert className="h-6 w-6 text-ember" aria-hidden="true" />}>
                Nothing has been charged. Your order for {formatPrice(view.order.total)} is saved, so you can pay for it now or cancel it.
              </Lead>
              <div className="mt-6 grid gap-3">
                <Button onClick={() => void retry(view.order)} disabled={busy !== null}>
                  {busy === 'retry' ? 'Opening secure checkout…' : `Pay ${formatPrice(view.order.total)}`}
                </Button>
                <Button variant="outline" onClick={() => void cancelOrder(view.order)} disabled={busy !== null}>
                  {busy === 'cancel' ? 'Cancelling…' : 'Cancel this order'}
                </Button>
              </div>
            </>
          )}

          {view.kind === 'cancelled' && (
            <>
              <p className="text-bone/80">
                {view.order.payment_status === 'refund_required'
                  ? 'This order was cancelled after a payment came in. We’ll refund it to your card.'
                  : 'This order is cancelled and nothing was charged. Your cart is still here if you’d like to order again.'}
              </p>
              <Button className="mt-6 w-full" onClick={close}>
                Back to the menu
              </Button>
            </>
          )}

          {view.kind === 'error' && (
            <>
              <p className="text-bone/80">{view.message}</p>
              <Button variant="outline" className="mt-6 w-full" onClick={() => reload(0)}>
                Try again
              </Button>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

function Lead({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-start gap-3 text-bone/85">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{children}</span>
    </p>
  )
}
