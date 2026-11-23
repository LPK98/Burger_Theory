import { SITE } from '../data/site'

/** Joins class names, skipping falsy values. */
export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

const money = new Intl.NumberFormat(SITE.locale, { style: 'currency', currency: SITE.currency })

/** Prices are stored in cents to keep cart maths exact. */
export function formatPrice(cents: number) {
  return money.format(cents / 100)
}

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
