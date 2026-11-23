import { Flame, Leaf, Plus, Sparkles, Users } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { Product } from '../data/products'
import { useCart, useCartActions } from '../hooks/useCart'
import { flyToCart } from '../lib/flyToCart'
import { cn, formatPrice } from '../lib/utils'
import { Button } from './Button'
import { QuantityStepper } from './QuantityStepper'

const BADGE_ICON = {
  Signature: Sparkles,
  Hot: Flame,
  'Plant-based': Leaf,
  'For two': Users,
} as const

export function ProductCard({ product, className }: { product: Product; className?: string }) {
  const { quantityOf } = useCart()
  const { add, setQuantity } = useCartActions()
  const quantity = quantityOf(product.id)

  const imageRef = useRef<HTMLImageElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const incrementRef = useRef<HTMLButtonElement>(null)
  // "Add to cart" turns into a stepper (and back). Keep keyboard focus on the control that replaces it.
  const focusNext = useRef<'stepper' | 'add' | null>(null)

  useEffect(() => {
    if (focusNext.current === 'stepper' && quantity > 0) incrementRef.current?.focus()
    if (focusNext.current === 'add' && quantity === 0) addRef.current?.focus()
    focusNext.current = null
  }, [quantity])

  const handleAdd = () => {
    focusNext.current = 'stepper'
    add(product.id)
    flyToCart(imageRef.current)
  }

  const handleChange = (next: number) => {
    if (next <= 0) focusNext.current = 'add'
    if (next > quantity) flyToCart(imageRef.current)
    setQuantity(product.id, next)
  }

  const BadgeIcon = product.badge ? BADGE_ICON[product.badge] : null
  const titleId = `product-${product.id}`

  return (
    <article
      aria-labelledby={titleId}
      data-product={product.id}
      className={cn('product-card group/card relative flex flex-col bg-char-2', className)}
    >
      <div className="relative aspect-[5/4] overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-x-[-10%] bottom-[-35%] top-[30%] bg-[radial-gradient(closest-side,rgba(240,120,50,0.32),rgba(240,120,50,0.08)_55%,transparent_75%)] opacity-60 transition-opacity duration-700 group-hover/card:opacity-100"
        />
        <img
          ref={imageRef}
          src={product.image}
          alt={product.imageAlt}
          width={1000}
          height={1000}
          loading="lazy"
          decoding="async"
          className="absolute left-[4%] top-[-19%] w-[92%] transition-transform duration-[900ms] ease-[var(--ease-expo)] will-change-transform group-hover/card:-translate-y-[3%] group-hover/card:scale-[1.07]"
        />
        {product.badge && BadgeIcon && (
          <span className="ui absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-cream/15 bg-ink/70 px-3 py-1.5 text-xs text-cream">
            <BadgeIcon className="h-3.5 w-3.5 text-ember" aria-hidden="true" />
            {product.badge}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col px-6 pb-6 pt-5">
        <h3 id={titleId} className="display text-[2.1rem] text-cream [font-stretch:66%]">
          {product.name}
        </h3>
        <p className="mt-3 max-w-[40ch] text-[0.98rem] leading-relaxed text-bone/70">{product.description}</p>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-4 pt-7">
          <p className="display text-[2.1rem] text-bone">
            <span className="sr-only">Price: </span>
            {formatPrice(product.price)}
          </p>
          {quantity > 0 ? (
            <QuantityStepper name={product.name} quantity={quantity} onChange={handleChange} incrementRef={incrementRef} />
          ) : (
            <Button
              ref={addRef}
              size="sm"
              className="h-11"
              onClick={handleAdd}
              icon={<Plus className="h-4 w-4" aria-hidden="true" />}
              aria-label={`Add ${product.name} to cart`}
            >
              Add to cart
            </Button>
          )}
        </div>
      </div>
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-[2px] origin-left scale-x-0 bg-ember transition-transform duration-700 ease-[var(--ease-expo)] group-hover/card:scale-x-100"
      />
    </article>
  )
}
