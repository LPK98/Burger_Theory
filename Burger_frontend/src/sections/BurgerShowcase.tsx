import { ShoppingBag } from 'lucide-react'
import { useId, useRef } from 'react'
import { Button } from '../components/Button'
import { SplitLines } from '../components/SplitLines'
import { PRODUCTS_BY_ID, SIGNATURE_PRODUCT_ID } from '../data/products'
import { useCartActions } from '../hooks/useCart'
import { gsap, MOTION, ScrollTrigger, useGSAP } from '../lib/gsap'
import { productSrcSet } from '../lib/productImage'
import { revealLines, revealUp } from '../lib/reveal'
import { formatPrice } from '../lib/utils'
import './BurgerShowcase.css'

const SPECS = [
  { term: 'Beef', detail: 'Two 90 g smashed patties' },
  { term: 'Cheese', detail: '12-month aged cheddar' },
  { term: 'Bun', detail: 'Sesame brioche, baked daily' },
  { term: 'Sauce', detail: 'Theory sauce, recipe classified' },
]

const RING_TEXT = 'The Theory Classic ✦ Double smashed ✦ Aged cheddar ✦ Toasted brioche ✦ '

/** Text set around the turntable. Rendered twice: once behind the burger, once in front. */
function TurntableRing({ pathId }: { pathId: string }) {
  return (
    <svg viewBox="0 0 400 400" className="h-full w-full" aria-hidden="true" focusable="false">
      <defs>
        {/* Counter-clockwise, so the text on the near (front) side of the stand reads upright. */}
        <path id={pathId} d="M200,200 m-176,0 a176,176 0 1,0 352,0 a176,176 0 1,0 -352,0" />
      </defs>
      <circle cx="200" cy="200" r="197" fill="none" stroke="rgba(240,120,50,0.45)" strokeWidth="1.2" />
      <circle cx="200" cy="200" r="157" fill="none" stroke="rgba(244,233,216,0.16)" strokeWidth="1" strokeDasharray="2 7" />
      <text className="ring-text">
        <textPath href={`#${pathId}`} textLength="1100" lengthAdjust="spacing">
          {RING_TEXT}
        </textPath>
      </text>
    </svg>
  )
}

/** SECTION 03 — the signature burger on a slowly turning stand under a single spotlight. */
export function BurgerShowcase() {
  const root = useRef<HTMLElement>(null)
  const product = PRODUCTS_BY_ID[SIGNATURE_PRODUCT_ID]
  const { add, open } = useCartActions()
  const baseId = useId().replace(/[^a-zA-Z0-9_-]/g, '')

  const orderNow = () => {
    add(product.id)
    open()
  }

  useGSAP(
    () => {
      const section = root.current!
      const q = gsap.utils.selector(section)
      const stage = q('[data-anim="stage"]')[0] as HTMLElement
      const mm = gsap.matchMedia()

      mm.add(MOTION.full, () => {
        revealLines(q('[data-line]'), q('h2')[0])
        revealUp(q('[data-reveal]'), q('[data-reveal]')[0], { stagger: 0.1 })

        // The burger lowers into the light while the section scrolls into place.
        gsap.fromTo(
          q('[data-anim="burger"]'),
          { yPercent: -18, rotation: -9, scale: 0.82 },
          { yPercent: 0, rotation: 0, scale: 1, ease: 'none', scrollTrigger: { trigger: stage, start: 'top bottom', end: 'center 58%', scrub: 0.8 } },
        )
        gsap.fromTo(
          q('[data-anim="light"]'),
          { autoAlpha: 0, scaleY: 0.6 },
          { autoAlpha: 1, scaleY: 1, ease: 'none', scrollTrigger: { trigger: section, start: 'top 80%', end: 'top 10%', scrub: true } },
        )
        gsap.from(q('[data-anim="plate"]'), {
          autoAlpha: 0,
          scale: 0.7,
          ease: 'none',
          scrollTrigger: { trigger: stage, start: 'top 95%', end: 'center 60%', scrub: true },
        })

        // The stand turns on its own, and spins up while the visitor scrolls past it.
        const spin = gsap.to(q('[data-anim="ring"]'), { rotation: 360, duration: 42, ease: 'none', repeat: -1, paused: true })
        // The speed the spin is heading for. A new boost tween is only made when the scroll speed
        // moves it noticeably, rather than on every scroll update (that was a tween per frame).
        let target = 1
        ScrollTrigger.create({
          trigger: section,
          start: 'top bottom',
          end: 'bottom top',
          onToggle: (self) => (self.isActive ? spin.play() : spin.pause()),
          onUpdate: (self) => {
            const boost = gsap.utils.clamp(1, 7, 1 + Math.abs(self.getVelocity()) / 240)
            if (Math.abs(boost - target) < 0.25) return
            target = boost
            gsap.to(spin, {
              timeScale: boost,
              duration: 0.25,
              overwrite: true,
              onComplete: () => {
                target = 1
                gsap.to(spin, { timeScale: 1, duration: 1.6, ease: 'power2.out', overwrite: true })
              },
            })
          },
        })
      })

      // Pointer parallax: the burger leans gently toward the cursor.
      mm.add(`${MOTION.full} and (hover: hover) and (pointer: fine)`, () => {
        const tilt = q('[data-anim="tilt"]')[0]
        const rings = q('[data-anim="ring-shift"]')
        const xTo = gsap.quickTo(tilt, 'x', { duration: 0.9, ease: 'power3.out' })
        const yTo = gsap.quickTo(tilt, 'y', { duration: 0.9, ease: 'power3.out' })
        const rTo = gsap.quickTo(tilt, 'rotation', { duration: 1.1, ease: 'power3.out' })
        const ringX = gsap.quickTo(rings, 'x', { duration: 1.2, ease: 'power3.out' })
        const onMove = (event: PointerEvent) => {
          const box = stage.getBoundingClientRect()
          const px = (event.clientX - box.left) / box.width - 0.5
          const py = (event.clientY - box.top) / box.height - 0.5
          xTo(px * 28)
          yTo(py * 18)
          rTo(px * 3.5)
          ringX(px * -14)
        }
        const onLeave = () => {
          xTo(0)
          yTo(0)
          rTo(0)
          ringX(0)
        }
        stage.addEventListener('pointermove', onMove)
        stage.addEventListener('pointerleave', onLeave)
        return () => {
          stage.removeEventListener('pointermove', onMove)
          stage.removeEventListener('pointerleave', onLeave)
        }
      })
    },
    { scope: root },
  )

  return (
    <section id="signature" ref={root} tabIndex={-1} aria-labelledby="showcase-title" className="showcase relative overflow-hidden bg-ink outline-none">
      <div className="shell relative grid items-center gap-y-6 pb-28 pt-20 lg:grid-cols-12 lg:gap-x-10 lg:py-36">
        <div className="relative z-10 order-2 lg:order-1 lg:col-span-5">
          <SplitLines as="h2" id="showcase-title" lines={['The Theory', 'Classic']} className="display text-[clamp(3.9rem,8.6vw,8.75rem)] text-cream" />
          <p data-reveal className="mt-7 max-w-[36ch] text-[1.2rem] leading-relaxed text-bone/80">
            {product.description}
          </p>
          <dl data-reveal className="mt-10 grid max-w-[30rem] grid-cols-2 gap-x-8 gap-y-6 border-t border-line pt-8">
            {SPECS.map((spec) => (
              <div key={spec.term}>
                <dt className="ui text-sm text-ash">{spec.term}</dt>
                <dd className="mt-1 text-bone">{spec.detail}</dd>
              </div>
            ))}
          </dl>
          <div data-reveal className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-4">
            <p className="display text-[3.5rem] text-cream">
              <span className="sr-only">Price: </span>
              {formatPrice(product.price)}
            </p>
            <Button size="lg" onClick={orderNow} icon={<ShoppingBag className="h-5 w-5" aria-hidden="true" />}>
              Order now
            </Button>
          </div>
        </div>

        <div className="relative order-1 lg:order-2 lg:col-span-7" data-anim="stage">
          <div className="showcase-light" data-anim="light" aria-hidden="true" />
          <div className="turntable">
            <div className="showcase-rim" aria-hidden="true" />
            <div className="ring ring-back" aria-hidden="true">
              <div className="ring-shift" data-anim="ring-shift">
                <div className="ring-spin" data-anim="ring">
                  <TurntableRing pathId={`${baseId}-back`} />
                </div>
              </div>
            </div>
            <div className="plate" data-anim="plate" aria-hidden="true" />
            <div className="showcase-burger" data-anim="burger">
              <div className="h-full w-full" data-anim="tilt">
                <img
                  src={product.image}
                  srcSet={productSrcSet(product.image)}
                  sizes="(min-width: 1024px) 46rem, 100vw"
                  alt={product.imageAlt}
                  width={1000}
                  height={1000}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full"
                />
              </div>
            </div>
            <div className="ring ring-front" aria-hidden="true">
              <div className="ring-shift" data-anim="ring-shift">
                <div className="ring-spin" data-anim="ring">
                  <TurntableRing pathId={`${baseId}-front`} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
