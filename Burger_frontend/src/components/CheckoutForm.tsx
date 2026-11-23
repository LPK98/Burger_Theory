import { ArrowLeft, Banknote, CreditCard, Lock, MapPin, ShoppingBag } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { CartItem } from '../context/cart-store'
import { useAuth } from '../hooks/useAuth'
import { useRestaurantProfile } from '../hooks/useRestaurantProfile'
import { cn, formatPrice } from '../lib/utils'
import { addresses } from '../services/api/client'
import type { Cart, FulfilmentType, Order, PaymentMethod } from '../services/api/types'
import { checkoutErrorMessage, placeOrder, quoteCart, type DeliveryAddress } from '../services/orders'
import { Field } from './AuthDialog'
import { Button } from './Button'

const FULFILMENT_LABEL: Record<FulfilmentType, { title: string; sub: string }> = {
  delivery: { title: 'Delivery', sub: 'To your door' },
  pickup: { title: 'Pickup', sub: 'Collect at the counter' },
}

function paymentCopy(method: PaymentMethod, fulfilment: FulfilmentType): { title: string; sub: string; icon: ReactNode } {
  const icon = 'h-5 w-5 shrink-0'
  switch (method) {
    case 'stripe':
      return { title: 'Card', sub: 'Pay on Stripe’s secure checkout page.', icon: <CreditCard className={icon} aria-hidden="true" /> }
    case 'payhere':
      return { title: 'PayHere', sub: 'Cards and wallets on PayHere’s checkout page.', icon: <CreditCard className={icon} aria-hidden="true" /> }
    case 'cod':
      return fulfilment === 'delivery'
        ? { title: 'Cash on delivery', sub: 'Pay the rider when your order arrives.', icon: <Banknote className={icon} aria-hidden="true" /> }
        : { title: 'Pay at pickup', sub: 'Pay when you collect your order.', icon: <Banknote className={icon} aria-hidden="true" /> }
  }
}

type AddressErrors = Partial<Record<keyof DeliveryAddress, string>>

interface CheckoutFormProps {
  items: CartItem[]
  onBack: () => void
  /** Cash orders finish here; online orders leave the page for the payment provider. */
  onPlaced: (order: Order) => void
}

/**
 * The checkout step of the cart drawer: fulfilment, delivery address and payment method,
 * with totals quoted by the API (delivery fee, discounts and minimums included).
 */
export function CheckoutForm({ items, onBack, onPlaced }: CheckoutFormProps) {
  const { user } = useAuth()
  const ordering = useRestaurantProfile().ordering
  const fulfilmentTypes = ordering?.fulfilmentTypes ?? []
  const paymentMethods = ordering?.paymentMethods ?? []

  const [fulfilment, setFulfilment] = useState<FulfilmentType | null>(null)
  const [method, setMethod] = useState<PaymentMethod | null>(null)
  const chosenFulfilment = fulfilment && fulfilmentTypes.includes(fulfilment) ? fulfilment : (fulfilmentTypes[0] ?? null)
  const chosenMethod = method && paymentMethods.includes(method) ? method : (paymentMethods[0] ?? null)

  const [address, setAddress] = useState<DeliveryAddress>({ recipient_name: user?.name ?? '', phone: user?.phone ?? '', line1: '', line2: '', city: '' })
  const [hasSavedAddress, setHasSavedAddress] = useState(false)
  const [addressErrors, setAddressErrors] = useState<AddressErrors>({})
  const [quote, setQuote] = useState<{ cart: Cart; key: string } | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // One key per attempt: a retry of the same details reuses it (the API returns the first
  // order instead of a second), and any change to the details starts a new attempt.
  const attempt = useRef(crypto.randomUUID())
  const newAttempt = () => {
    attempt.current = crypto.randomUUID()
    setError(null)
  }

  const lines = items.map((i) => ({ productId: i.productId, quantity: i.quantity }))
  const quoteKey = `${chosenFulfilment}|${items.map((i) => `${i.productId}:${i.quantity}`).join(',')}`
  const current = quote?.key === quoteKey ? quote.cart : null

  // The server prices the cart (and knows the delivery fee); re-quote whenever it changes.
  useEffect(() => {
    if (!chosenFulfilment) return
    let cancelled = false
    quoteCart(lines, chosenFulfilment)
      .then((cart) => {
        if (!cancelled) {
          setQuote({ cart, key: quoteKey })
          setQuoteError(null)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setQuoteError(checkoutErrorMessage(e))
      })
    return () => {
      cancelled = true
    }
    // `lines` is derived from quoteKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey])

  // Start from the customer's saved delivery address, if there is one.
  useEffect(() => {
    let cancelled = false
    addresses
      .list()
      .then((list) => {
        const saved = list.find((a) => a.is_default) ?? list[0]
        if (cancelled || !saved) return
        setHasSavedAddress(true)
        setAddress((a) => (a.line1 ? a : { recipient_name: saved.recipient_name, phone: saved.phone, line1: saved.line1, line2: saved.line2 ?? '', city: saved.city }))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const updateAddress = (key: keyof DeliveryAddress, value: string) => {
    setAddress((a) => ({ ...a, [key]: value }))
    setAddressErrors((e) => ({ ...e, [key]: undefined }))
    newAttempt()
  }

  const submit = async () => {
    if (!chosenFulfilment || !chosenMethod || !current) return
    if (chosenFulfilment === 'delivery') {
      const found: AddressErrors = {}
      if (!address.recipient_name.trim()) found.recipient_name = 'Who should we hand it to?'
      if (!/\d{7,}/.test(address.phone.replace(/\D/g, ''))) found.phone = 'Enter a phone number the rider can call.'
      if (!address.line1.trim()) found.line1 = 'Enter the street address.'
      if (!address.city.trim()) found.city = 'Enter the city.'
      setAddressErrors(found)
      if (Object.keys(found).length) return
    }

    setSubmitting(true)
    setError(null)
    try {
      const outcome = await placeOrder(
        lines,
        {
          fulfilment: chosenFulfilment,
          paymentMethod: chosenMethod,
          address: chosenFulfilment === 'delivery' ? address : undefined,
          saveAddress: !hasSavedAddress,
        },
        attempt.current,
      )
      if (outcome.status === 'placed') {
        setSubmitting(false)
        onPlaced(outcome.order)
      }
      // 'redirecting': keep the button busy while the browser leaves for the payment page.
    } catch (e) {
      setSubmitting(false)
      setError(checkoutErrorMessage(e))
    }
  }

  const online = chosenMethod === 'stripe' || chosenMethod === 'payhere'
  const blockers = current?.issues.map((i) => i.message) ?? []
  const closed = ordering !== null && !ordering.acceptingOrders
  const nothingToPayWith = ordering !== null && paymentMethods.length === 0
  const canSubmit = Boolean(current?.can_checkout && chosenFulfilment && chosenMethod && !closed && !submitting)

  const fulfilmentName = useId()
  const paymentName = useId()

  return (
    <>
      <div className="flex-1 overflow-y-auto overscroll-contain px-6 pb-6" data-lenis-prevent>
        <button type="button" onClick={onBack} className="ui mt-5 inline-flex items-center gap-2 text-sm text-ash transition-colors hover:text-ember">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to cart
        </button>

        {ordering === null ? (
          <div className="mt-6 space-y-3" aria-busy="true" aria-label="Loading checkout">
            <div className="h-20 animate-pulse bg-ink" />
            <div className="h-36 animate-pulse bg-ink" />
          </div>
        ) : closed ? (
          <Notice>We’re not taking online orders right now. Please check back soon.</Notice>
        ) : (
          <>
            <fieldset className="mt-6">
              <legend className="ui text-[0.75rem] uppercase tracking-[0.18em] text-ember">How you’ll get it</legend>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {fulfilmentTypes.map((type) => (
                  <Choice
                    key={type}
                    name={fulfilmentName}
                    checked={chosenFulfilment === type}
                    onSelect={() => {
                      setFulfilment(type)
                      newAttempt()
                    }}
                    title={FULFILMENT_LABEL[type].title}
                    sub={FULFILMENT_LABEL[type].sub}
                    icon={type === 'delivery' ? <MapPin className="h-5 w-5 shrink-0" aria-hidden="true" /> : <ShoppingBag className="h-5 w-5 shrink-0" aria-hidden="true" />}
                  />
                ))}
              </div>
            </fieldset>

            {chosenFulfilment === 'delivery' && (
              <fieldset className="mt-7 space-y-4">
                <legend className="ui text-[0.75rem] uppercase tracking-[0.18em] text-ember">Deliver to</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Name" autoComplete="name" value={address.recipient_name} onChange={(e) => updateAddress('recipient_name', e.target.value)} error={addressErrors.recipient_name} />
                  <Field label="Phone" type="tel" inputMode="tel" autoComplete="tel" value={address.phone} onChange={(e) => updateAddress('phone', e.target.value)} error={addressErrors.phone} />
                </div>
                <Field label="Street address" autoComplete="address-line1" value={address.line1} onChange={(e) => updateAddress('line1', e.target.value)} error={addressErrors.line1} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Apartment, landmark" optional="Optional" autoComplete="address-line2" value={address.line2 ?? ''} onChange={(e) => updateAddress('line2', e.target.value)} />
                  <Field label="City" autoComplete="address-level2" value={address.city} onChange={(e) => updateAddress('city', e.target.value)} error={addressErrors.city} />
                </div>
              </fieldset>
            )}

            <fieldset className="mt-7">
              <legend className="ui text-[0.75rem] uppercase tracking-[0.18em] text-ember">Pay with</legend>
              {nothingToPayWith ? (
                <Notice>Online ordering isn’t available right now.</Notice>
              ) : (
                <div className="mt-3 space-y-3">
                  {paymentMethods.map((m) => {
                    const copy = paymentCopy(m, chosenFulfilment ?? 'pickup')
                    return (
                      <Choice
                        key={m}
                        name={paymentName}
                        checked={chosenMethod === m}
                        onSelect={() => {
                          setMethod(m)
                          newAttempt()
                        }}
                        title={copy.title}
                        sub={copy.sub}
                        icon={copy.icon}
                        wide
                      />
                    )
                  })}
                </div>
              )}
            </fieldset>
          </>
        )}
      </div>

      <footer className="border-t border-line px-6 pb-6 pt-5">
        {current ? (
          <dl className="ui space-y-1.5 text-[0.95rem]">
            <Row label="Subtotal" value={formatPrice(current.subtotal)} />
            {current.discount_total > 0 && <Row label={`Discount${current.coupon ? ` (${current.coupon.code})` : ''}`} value={`−${formatPrice(current.discount_total)}`} />}
            {chosenFulfilment === 'delivery' && <Row label="Delivery" value={current.delivery_fee === 0 ? 'Free' : formatPrice(current.delivery_fee)} />}
            <div className="flex items-baseline justify-between pt-2">
              <dt className="text-ash">Total</dt>
              <dd className="display tabular text-[2.4rem] text-bone">{formatPrice(current.total)}</dd>
            </div>
          </dl>
        ) : quoteError ? (
          <p className="ui text-sm text-ember-hot">{quoteError}</p>
        ) : (
          <div className="h-[5.5rem] animate-pulse bg-ink" aria-busy="true" aria-label="Working out your total" />
        )}

        <div role="status" aria-live="polite">
          {blockers.length > 0 && <Notice>{blockers.join(' ')}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
        </div>

        <Button size="lg" className="mt-5 w-full" onClick={submit} disabled={!canSubmit}>
          {submitting ? (online ? 'Opening secure checkout…' : 'Placing your order…') : online && current ? `Pay ${formatPrice(current.total)}` : 'Place order'}
        </Button>
        {online && (
          <p className="ui mt-3 flex items-center justify-center gap-1.5 text-center text-[0.8125rem] text-ash">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            You’ll enter your card on {chosenMethod === 'stripe' ? 'Stripe' : 'PayHere'}’s page, never on this site.
          </p>
        )}
      </footer>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-ash">{label}</dt>
      <dd className="tabular text-bone">{value}</dd>
    </div>
  )
}

function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'error' }) {
  return (
    <p
      className={cn(
        'ui mt-4 rounded-[3px] border p-4 text-[0.9rem] leading-relaxed',
        tone === 'error' ? 'border-ember-hot/60 bg-ember-hot/10 text-cream' : 'border-ember/40 bg-ember/10 text-cream',
      )}
    >
      {children}
    </p>
  )
}

interface ChoiceProps {
  name: string
  checked: boolean
  onSelect: () => void
  title: string
  sub: string
  icon: ReactNode
  wide?: boolean
}

/** A radio button drawn as a card. The native input stays in the tab order for keyboards. */
function Choice({ name, checked, onSelect, title, sub, icon, wide }: ChoiceProps) {
  return (
    <label
      className={cn(
        'relative flex cursor-pointer gap-3 rounded-[3px] border bg-ink p-4 transition-colors duration-200 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ember',
        wide ? 'items-center' : 'flex-col',
        checked ? 'border-ember text-cream' : 'border-line text-bone/85 hover:border-cream/30',
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="sr-only" />
      <span className={cn(checked ? 'text-ember' : 'text-ash')}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="ui block text-[0.95rem] text-cream">{title}</span>
        <span className="ui mt-0.5 block text-[0.8125rem] leading-snug text-ash">{sub}</span>
      </span>
      {wide && (
        <span aria-hidden="true" className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-full border', checked ? 'border-ember' : 'border-cream/30')}>
          {checked && <span className="h-2.5 w-2.5 rounded-full bg-ember" />}
        </span>
      )}
    </label>
  )
}
