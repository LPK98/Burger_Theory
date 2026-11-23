import { gsap } from './gsap'
import { prefersReducedMotion } from './utils'

/**
 * Sends a copy of a product image arcing into the cart button, so it's obvious
 * where the item went. Purely visual; skipped for reduced motion.
 */
export function flyToCart(source: HTMLElement | null) {
  const target = document.getElementById('cart-button')
  if (!source || !target || prefersReducedMotion()) return

  const from = source.getBoundingClientRect()
  const to = target.getBoundingClientRect()
  if (from.width === 0 || to.width === 0) return

  const clone = source.cloneNode(true) as HTMLElement
  clone.removeAttribute('id')
  clone.setAttribute('aria-hidden', 'true')
  Object.assign(clone.style, {
    position: 'fixed',
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    margin: '0',
    zIndex: '85',
    pointerEvents: 'none',
    transform: 'none',
  })
  document.body.appendChild(clone)

  const dx = to.left + to.width / 2 - (from.left + from.width / 2)
  const dy = to.top + to.height / 2 - (from.top + from.height / 2)
  const scale = Math.max(0.06, (to.width * 1.2) / from.width)

  // x eases out while y eases in: together they trace an arc.
  gsap
    .timeline({ onComplete: () => clone.remove() })
    .to(clone, { x: dx, duration: 0.85, ease: 'power2.out' }, 0)
    .to(clone, { y: dy, duration: 0.85, ease: 'power3.in' }, 0)
    .to(clone, { scale, rotation: -12, duration: 0.85, ease: 'power2.in' }, 0)
    .to(clone, { autoAlpha: 0, duration: 0.18, ease: 'none' }, 0.7)
}
