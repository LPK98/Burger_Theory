import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { Flip } from 'gsap/Flip'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

// Register once, before any component uses them.
gsap.registerPlugin(ScrollTrigger, Flip, useGSAP)
gsap.defaults({ ease: 'power3.out', duration: 0.8 })

// Mobile browsers resize the viewport when the address bar shows/hides;
// recalculating every pinned section on that would make the page jump.
ScrollTrigger.config({ ignoreMobileResize: true })

/** Media queries shared by every gsap.matchMedia() block in the app. */
export const MOTION = {
  full: '(prefers-reduced-motion: no-preference)',
  reduced: '(prefers-reduced-motion: reduce)',
  desktop: '(min-width: 1024px)',
  compact: '(max-width: 1023.98px)',
} as const

export { Flip, gsap, ScrollTrigger, useGSAP }
