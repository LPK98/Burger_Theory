import { gsap } from './gsap'

/**
 * Shared scroll reveals. Each plays once when its trigger enters the viewport,
 * so returning visitors scrolling back up aren't shown the same entrance again.
 * Call these only inside a reduced-motion-aware gsap.matchMedia() block.
 */

type Targets = gsap.TweenTarget

/** Headline lines rise out of their masks. */
export function revealLines(targets: Targets, trigger: Element, vars: gsap.TweenVars = {}) {
  return gsap.from(targets, {
    yPercent: 112,
    duration: 1.25,
    ease: 'expo.out',
    stagger: 0.09,
    scrollTrigger: { trigger, start: 'top 84%', once: true },
    ...vars,
  })
}

/** Copy and small elements fade up. */
export function revealUp(targets: Targets, trigger: Element, vars: gsap.TweenVars = {}) {
  return gsap.from(targets, {
    y: 34,
    autoAlpha: 0,
    duration: 1.05,
    ease: 'power3.out',
    stagger: 0.08,
    scrollTrigger: { trigger, start: 'top 86%', once: true },
    ...vars,
  })
}

/** A photo frame wipes open from the bottom while the photo inside settles from a slight zoom. */
export function revealImage(frame: Element, image: Element | null, vars: { delay?: number; start?: string } = {}) {
  const tl = gsap.timeline({
    delay: vars.delay ?? 0,
    scrollTrigger: { trigger: frame, start: vars.start ?? 'top 88%', once: true },
  })
  tl.fromTo(frame, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.4, ease: 'expo.inOut' })
  if (image) tl.fromTo(image, { scale: 1.28 }, { scale: 1, duration: 1.9, ease: 'expo.out' }, 0.15)
  return tl
}
