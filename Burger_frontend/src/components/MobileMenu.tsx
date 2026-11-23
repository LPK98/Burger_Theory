import { X } from 'lucide-react'
import { useEffect, useRef, type RefObject } from 'react'
import { NAV_LINKS } from '../data/site'
import { phoneHref, useRestaurantProfile } from '../hooks/useRestaurantProfile'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useLenis } from '../hooks/useLenis'
import { gsap, useGSAP } from '../lib/gsap'
import { cn, prefersReducedMotion } from '../lib/utils'
import { Button } from './Button'
import { ICON_BUTTON, ICON_BUTTON_IDLE } from './icon-button'
import { Logo } from './Logo'
import { SocialLinks } from './SocialIcons'

interface MobileMenuProps {
  open: boolean
  active: string
  onClose: () => void
  onNavigate: (id: string) => void
  returnFocusTo: RefObject<HTMLButtonElement | null>
}

export function MobileMenu({ open, active, onClose, onNavigate, returnFocusTo }: MobileMenuProps) {
  const phone = useRestaurantProfile().profile?.phone
  const root = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const firstRun = useRef(true)
  const { lock, unlock } = useLenis()

  useFocusTrap(root, open, onClose)

  useEffect(() => {
    if (!open) return
    lock()
    const timer = window.setTimeout(() => closeButton.current?.focus(), 60)
    const returnTarget = returnFocusTo.current
    return () => {
      window.clearTimeout(timer)
      unlock()
      returnTarget?.focus({ preventScroll: true })
    }
  }, [open, lock, unlock, returnFocusTo])

  useGSAP(
    () => {
      if (firstRun.current) {
        firstRun.current = false
        if (!open) return
      }
      const speed = prefersReducedMotion() ? 0 : 1
      if (open) {
        gsap.set(root.current, { visibility: 'visible' })
        gsap.fromTo(root.current, { clipPath: 'inset(0% 0% 100% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.8 * speed, ease: 'expo.inOut' })
        gsap.from('[data-menu-link]', { yPercent: 110, duration: 0.9 * speed, ease: 'expo.out', stagger: 0.06, delay: 0.25 * speed })
        gsap.from('[data-menu-foot]', { autoAlpha: 0, y: 20, duration: 0.7 * speed, delay: 0.45 * speed })
      } else {
        gsap.to(root.current, {
          clipPath: 'inset(0% 0% 100% 0%)',
          duration: 0.6 * speed,
          ease: 'expo.inOut',
          onComplete: () => {
            gsap.set(root.current, { visibility: 'hidden' })
          },
        })
      }
    },
    { scope: root, dependencies: [open] },
  )

  return (
    <div
      ref={root}
      id="mobile-menu"
      role="dialog"
      aria-modal="true"
      aria-label="Site menu"
      inert={!open}
      className="invisible fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-ink lg:hidden"
    >
      <div className="shell flex h-[4.25rem] shrink-0 items-center justify-between">
        <Logo />
        <button
          ref={closeButton}
          type="button"
          onClick={onClose}
          aria-label="Close site menu"
          className={cn(ICON_BUTTON, ICON_BUTTON_IDLE)}
        >
          <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      <nav aria-label="Mobile" className="shell flex flex-1 flex-col justify-center py-10">
        <ul className="space-y-1">
          {NAV_LINKS.map((link) => (
            <li key={link.id} className="line-mask">
              <a
                data-menu-link
                href={`#${link.id}`}
                onClick={(event) => {
                  event.preventDefault()
                  onNavigate(link.id)
                }}
                aria-current={active === link.id ? 'true' : undefined}
                className={cn(
                  'display block py-1 text-[clamp(3.4rem,17vw,6rem)] transition-colors',
                  active === link.id ? 'text-ember' : 'text-cream hover:text-ember',
                )}
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div data-menu-foot className="shell space-y-6 border-t border-line py-8">
        <Button size="lg" className="w-full" onClick={() => onNavigate('menu')}>
          Order now
        </Button>
        <div className="flex items-center justify-between gap-4">
          {phone ? (
            <a href={phoneHref(phone)} className="ui text-cream/80 hover:text-ember">
              {phone}
            </a>
          ) : (
            <span />
          )}
          <SocialLinks />
        </div>
      </div>
    </div>
  )
}
