import Lenis from 'lenis'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { usePrefersReducedMotion } from '../hooks/useMediaQuery'
import { gsap, ScrollTrigger } from '../lib/gsap'
import { SmoothScrollContext, type SmoothScrollValue } from './smooth-scroll'

let lockCount = 0

/**
 * Smooth scrolling with Lenis, driven by GSAP's ticker so Lenis and ScrollTrigger
 * always read the same scroll position on the same frame. Off for reduced motion.
 */
export function SmoothScrollProvider({ children }: { children: ReactNode }) {
  const reduced = usePrefersReducedMotion()
  const [lenis, setLenis] = useState<Lenis | null>(null)

  useEffect(() => {
    if (reduced) return

    const instance = new Lenis({
      lerp: 0.1,
      smoothWheel: true,
      // Touch devices keep native momentum scrolling; it feels better than an emulation.
      syncTouch: false,
      autoRaf: false,
    })

    instance.on('scroll', ScrollTrigger.update)
    const tick = (time: number) => instance.raf(time * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)
    // Lenis is an external system that only exists after mount; publishing it is this effect's job.
    // oxlint-disable-next-line react/set-state-in-effect
    setLenis(instance)

    return () => {
      gsap.ticker.remove(tick)
      gsap.ticker.lagSmoothing(500, 33)
      instance.destroy()
      setLenis(null)
    }
  }, [reduced])

  const scrollTo = useCallback<SmoothScrollValue['scrollTo']>(
    (target, options = {}) => {
      const offset = options.offset ?? 0
      if (lenis) {
        lenis.scrollTo(target, {
          offset,
          immediate: options.immediate,
          force: true,
          duration: 1.5,
          easing: (t) => 1 - Math.pow(1 - t, 4),
        })
        return
      }
      const behavior: ScrollBehavior = reduced || options.immediate ? 'auto' : 'smooth'
      if (typeof target === 'number') {
        window.scrollTo({ top: target + offset, behavior })
        return
      }
      const element = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target
      if (!element) return
      const top = element.getBoundingClientRect().top + window.scrollY + offset
      window.scrollTo({ top, behavior })
    },
    [lenis, reduced],
  )

  const lock = useCallback(() => {
    lockCount += 1
    lenis?.stop()
    document.documentElement.classList.add('scroll-locked')
  }, [lenis])

  const unlock = useCallback(() => {
    lockCount = Math.max(0, lockCount - 1)
    if (lockCount > 0) return
    lenis?.start()
    document.documentElement.classList.remove('scroll-locked')
  }, [lenis])

  const value = useMemo(() => ({ lenis, scrollTo, lock, unlock }), [lenis, scrollTo, lock, unlock])

  return <SmoothScrollContext.Provider value={value}>{children}</SmoothScrollContext.Provider>
}
