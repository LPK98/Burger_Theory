import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ProductCard } from '../components/ProductCard'
import { SplitLines } from '../components/SplitLines'
import { CATEGORIES, PRODUCTS, type CategoryFilter } from '../data/products'
import { Flip, gsap, MOTION, ScrollTrigger, useGSAP } from '../lib/gsap'
import { revealLines, revealUp } from '../lib/reveal'
import { cn, prefersReducedMotion } from '../lib/utils'

const matches = (filter: CategoryFilter, categories: string[]) => filter === 'all' || categories.includes(filter)

/** SECTION 05 — the menu, with category filters that re-flow the grid using GSAP Flip. */
export function Menu() {
  const root = useRef<HTMLElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  const flipState = useRef<Flip.FlipState | null>(null)
  const [filter, setFilter] = useState<CategoryFilter>('all')

  const counts = useMemo(
    () => Object.fromEntries(CATEGORIES.map((c) => [c.id, PRODUCTS.filter((p) => matches(c.id, p.categories)).length])) as Record<CategoryFilter, number>,
    [],
  )
  const visibleCount = counts[filter]
  const activeLabel = CATEGORIES.find((c) => c.id === filter)?.label ?? 'All'

  const choose = (next: CategoryFilter) => {
    if (next === filter) return
    if (grid.current && !prefersReducedMotion()) {
      flipState.current = Flip.getState(grid.current.querySelectorAll('[data-flip]'))
    }
    setFilter(next)
  }

  // After React has shown/hidden the cards, animate from the recorded layout to the new one.
  useLayoutEffect(() => {
    const state = flipState.current
    if (!state) return
    flipState.current = null
    Flip.from(state, {
      duration: 0.75,
      ease: 'power3.inOut',
      absolute: true,
      stagger: 0.03,
      onEnter: (elements) => {
        if (elements.length) gsap.fromTo(elements, { autoAlpha: 0, scale: 0.9 }, { autoAlpha: 1, scale: 1, duration: 0.6, delay: 0.2, ease: 'power3.out' })
      },
      onLeave: (elements) => {
        if (elements.length) gsap.to(elements, { autoAlpha: 0, scale: 0.9, duration: 0.4, ease: 'power2.in' })
      },
      // The grid changed height, so everything below needs fresh scroll positions.
      onComplete: () => ScrollTrigger.refresh(),
    })
  }, [filter])

  useGSAP(
    () => {
      const section = root.current!
      const q = gsap.utils.selector(section)
      const mm = gsap.matchMedia()
      mm.add(MOTION.full, () => {
        revealLines(q('[data-line]'), q('h2')[0])
        revealUp(q('[data-reveal]'), q('[data-reveal]')[0], { stagger: 0.1 })

        const cards = q('[data-card]')
        gsap.set(cards, { autoAlpha: 0, y: 56 })
        ScrollTrigger.create({
          trigger: grid.current,
          start: 'top 88%',
          once: true,
          onEnter: () => {
            const shown = cards.filter((card) => card.getClientRects().length > 0)
            const hidden = cards.filter((card) => !shown.includes(card))
            if (hidden.length) gsap.set(hidden, { clearProps: 'opacity,visibility,transform' })
            gsap.to(shown, { autoAlpha: 1, y: 0, duration: 1.1, ease: 'power3.out', stagger: 0.09, clearProps: 'opacity,visibility,transform' })
          },
        })
      })
    },
    { scope: root },
  )

  return (
    <section id="menu" ref={root} tabIndex={-1} aria-labelledby="menu-title" className="relative bg-ink py-24 outline-none lg:py-36">
      <div className="shell">
        <header className="grid gap-10 lg:grid-cols-12 lg:items-end">
          <SplitLines as="h2" id="menu-title" lines={['Signature', 'menu']} className="display text-[clamp(3.9rem,9.5vw,9.5rem)] text-cream lg:col-span-7" />
          <div className="lg:col-span-5 lg:pb-3">
            <p data-reveal className="max-w-[40ch] text-[1.15rem] leading-relaxed text-bone/75">
              Nine burgers, all smashed to order on the same 230 °C griddle. Add what you like to your cart and we’ll have it ready.
            </p>
            <fieldset data-reveal className="mt-8 flex flex-wrap gap-2">
              <legend className="sr-only">Filter burgers by type</legend>
              {CATEGORIES.map((category) => {
                const active = filter === category.id
                return (
                  <button
                    key={category.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => choose(category.id)}
                    className={cn(
                      'ui inline-flex h-11 items-center gap-2 rounded-[3px] border px-4 text-sm transition-[background-color,border-color,color] duration-300',
                      active ? 'border-ember bg-ember text-ink' : 'border-cream/20 text-cream/80 hover:border-cream/60 hover:text-cream',
                    )}
                  >
                    {category.label}
                    <span className={cn('tabular text-xs', active ? 'text-ink/70' : 'text-cream/45')}>{counts[category.id]}</span>
                  </button>
                )
              })}
            </fieldset>
          </div>
        </header>

        <p className="sr-only" aria-live="polite">
          {filter === 'all' ? `Showing all ${visibleCount} burgers.` : `Showing ${visibleCount} ${activeLabel.toLowerCase()} burgers.`}
        </p>

        <div ref={grid} className="mt-16 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {PRODUCTS.map((product) => {
            const visible = matches(filter, product.categories)
            return (
              <div key={product.id} data-flip data-flip-id={product.id} className={cn('flex', !visible && 'hidden')}>
                <div data-card className="flex w-full">
                  <ProductCard product={product} className="w-full" />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
