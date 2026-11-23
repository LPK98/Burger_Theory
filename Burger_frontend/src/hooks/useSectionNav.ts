import { useCallback, useEffect, useState } from 'react'
import { ScrollTrigger } from '../lib/gsap'
import { useLenis } from './useLenis'

/** Which of the given sections is currently in the middle of the viewport. */
export function useActiveSection(ids: readonly string[]) {
  const [active, setActive] = useState<string>(ids[0])

  useEffect(() => {
    const triggers: ScrollTrigger[] = []
    // Wait a frame so pinned sections have inserted their spacers first.
    const frame = requestAnimationFrame(() => {
      for (const id of ids) {
        const element = document.getElementById(id)
        if (!element) continue
        // A pinned section's own box is only one screen tall; its [data-nav-span] wrapper
        // spans the whole pinned scroll, so the link stays lit for as long as it's on screen.
        const span = element.closest<HTMLElement>('[data-nav-span]') ?? element
        triggers.push(
          ScrollTrigger.create({
            trigger: span,
            start: 'top 45%',
            end: 'bottom 45%',
            onToggle: (self) => {
              // Between tracked sections (e.g. the restaurant), no link is highlighted.
              setActive((current) => (self.isActive ? id : current === id ? '' : current))
            },
          }),
        )
      }
    })
    return () => {
      cancelAnimationFrame(frame)
      triggers.forEach((t) => t.kill())
    }
  }, [ids])

  return active
}

/** Smooth-scrolls to a section, then moves keyboard focus there without a second jump. */
export function useGoToSection() {
  const { scrollTo } = useLenis()
  return useCallback(
    (id: string) => {
      const target = document.getElementById(id)
      if (!target) return
      scrollTo(target)
      window.setTimeout(() => target.focus({ preventScroll: true }), 900)
    },
    [scrollTo],
  )
}
