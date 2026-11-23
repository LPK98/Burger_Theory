import type Lenis from 'lenis'
import { createContext } from 'react'

export type ScrollTarget = string | HTMLElement | number

export interface SmoothScrollValue {
  /** The Lenis instance, or null when smooth scrolling is off (reduced motion). */
  lenis: Lenis | null
  scrollTo: (target: ScrollTarget, options?: { offset?: number; immediate?: boolean }) => void
  /** Freezes page scrolling (open dialogs). Calls nest safely. */
  lock: () => void
  unlock: () => void
}

export const SmoothScrollContext = createContext<SmoothScrollValue | null>(null)
