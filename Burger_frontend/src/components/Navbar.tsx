import { Menu as MenuIcon, ShoppingBag, UserRound } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { NAV_LINKS } from '../data/site'
import { useAuth, useAuthActions } from '../hooks/useAuth'
import { useCart, useCartActions } from '../hooks/useCart'
import { useActiveSection, useGoToSection } from '../hooks/useSectionNav'
import { gsap, useGSAP } from '../lib/gsap'
import { cn, prefersReducedMotion } from '../lib/utils'
import { Button } from './Button'
import { ICON_BUTTON, ICON_BUTTON_IDLE } from './icon-button'
import { Logo } from './Logo'
import { MobileMenu } from './MobileMenu'

const SECTION_IDS = NAV_LINKS.map((l) => l.id)

export function Navbar() {
  const { count } = useCart()
  const { open: openCart } = useCartActions()
  const { status: authStatus, user } = useAuth()
  const { openDialog } = useAuthActions()
  const goTo = useGoToSection()
  const active = useActiveSection(SECTION_IDS)

  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const header = useRef<HTMLElement>(null)
  const nav = useRef<HTMLElement>(null)
  const dot = useRef<HTMLSpanElement>(null)
  const menuButton = useRef<HTMLButtonElement>(null)
  const badge = useRef<HTMLSpanElement>(null)
  const previousCount = useRef(count)
  // A link tapped inside the mobile menu waits until the menu has released its scroll lock.
  const pendingSection = useRef<string | null>(null)

  useEffect(() => {
    if (menuOpen || !pendingSection.current) return
    const id = pendingSection.current
    pendingSection.current = null
    goTo(id)
  }, [menuOpen, goTo])

  // Glassy bar once the page has moved; React bails out when the value doesn't change.
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 48)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])

  // The badge pops when a burger lands in the cart (timed with the fly-to-cart arc).
  useEffect(() => {
    if (count > previousCount.current && badge.current && !prefersReducedMotion()) {
      gsap.fromTo(badge.current, { scale: 1.7 }, { scale: 1, duration: 0.7, delay: 0.7, ease: 'expo.out' })
    }
    previousCount.current = count
  }, [count])

  // The active-section dot glides under the current link. It's positioned straight from the
  // DOM (no state), and re-measured when the bar resizes, e.g. once the web font arrives.
  useLayoutEffect(() => {
    const navEl = nav.current
    const dotEl = dot.current
    if (!navEl || !dotEl) return
    const place = () => {
      const link = navEl.querySelector<HTMLElement>('a[aria-current="true"]')
      if (!link || navEl.offsetWidth === 0) {
        dotEl.style.opacity = '0'
        return
      }
      const box = link.getBoundingClientRect()
      dotEl.style.setProperty('--x', `${box.left - navEl.getBoundingClientRect().left + box.width / 2}px`)
      dotEl.style.opacity = '1'
    }
    place()
    // Only animate moves after the first placement, so the dot doesn't fly in from the left edge.
    const frame = requestAnimationFrame(() => dotEl.toggleAttribute('data-ready', true))
    const observer = new ResizeObserver(place)
    observer.observe(navEl)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [active])

  // Entrance: the bar settles in just after the hero headline starts to rise (same font gate).
  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      const intro = gsap.from('[data-nav-in]', { autoAlpha: 0, y: -12, duration: 1.1, ease: 'expo.out', stagger: 0.06, delay: 0.55, paused: true })
      let alive = true
      const play = () => {
        if (alive) intro.play()
      }
      const fallback = window.setTimeout(play, 1500)
      document.fonts?.ready.then(play)
      return () => {
        alive = false
        window.clearTimeout(fallback)
      }
    },
    { scope: header },
  )

  const onLink = (id: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    setMenuOpen(false)
    goTo(id)
  }

  return (
    <>
      <header
        ref={header}
        className={cn(
          'fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-500',
          scrolled ? 'border-cream/[0.07] bg-ink/80 backdrop-blur-xl backdrop-saturate-150' : 'border-transparent bg-transparent',
        )}
      >
        {/* From lg up, three columns put the links on the page's centre line: the burger's axis. */}
        <div
          className={cn(
            'shell flex h-[4.25rem] items-center justify-between gap-6 transition-[height] duration-500 ease-[var(--ease-expo)] lg:grid lg:grid-cols-[1fr_auto_1fr]',
            scrolled ? 'lg:h-16' : 'lg:h-20',
          )}
        >
          <a
            href="#home"
            onClick={onLink('home')}
            aria-label="Burger Theory, back to the top"
            className="logo-link col-start-1 justify-self-start rounded-sm"
            data-nav-in
          >
            <Logo />
          </a>

          <nav ref={nav} aria-label="Main" className="relative col-start-2 hidden lg:block" data-nav-in>
            <ul className="flex items-center gap-9">
              {NAV_LINKS.map((link) => {
                const isActive = active === link.id
                return (
                  <li key={link.id}>
                    <a
                      href={`#${link.id}`}
                      onClick={onLink(link.id)}
                      aria-current={isActive ? 'true' : undefined}
                      className={cn(
                        'group ui inline-flex py-3 text-[0.9375rem] uppercase tracking-[0.12em] transition-colors duration-300',
                        isActive ? 'text-cream' : 'text-cream/60 hover:text-cream',
                      )}
                    >
                      {/* Same roll as the buttons; the negative margin drops the tracking after the last letter. */}
                      <span className="roll -mr-[0.12em]">
                        <span>{link.label}</span>
                        <span aria-hidden="true">{link.label}</span>
                      </span>
                    </a>
                  </li>
                )
              })}
            </ul>
            <span ref={dot} className="nav-dot" aria-hidden="true" />
          </nav>

          <div className="col-start-3 flex items-center gap-2 justify-self-end sm:gap-2.5">
            <AccountButton
              status={authStatus}
              name={user?.name ?? null}
              onClick={() => openDialog(authStatus === 'guest' ? 'login' : 'account')}
            />
            <button
              id="cart-button"
              type="button"
              onClick={openCart}
              aria-label={count > 0 ? `Open cart, ${count} ${count === 1 ? 'item' : 'items'}` : 'Open cart, empty'}
              className={cn(ICON_BUTTON, ICON_BUTTON_IDLE)}
              data-nav-in
            >
              <ShoppingBag className="h-[1.1rem] w-[1.1rem]" strokeWidth={1.75} aria-hidden="true" />
              <span
                ref={badge}
                aria-hidden="true"
                className={cn(
                  'ui tabular absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-ember px-1 text-[0.7rem] text-ink ring-2 ring-ink transition-opacity',
                  count > 0 ? 'opacity-100' : 'opacity-0',
                )}
              >
                {count}
              </span>
            </button>
            <div className="ml-1 hidden sm:block" data-nav-in>
              <Button size="sm" className="h-11" onClick={() => goTo('menu')}>
                Order now
              </Button>
            </div>
            <button
              ref={menuButton}
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label="Open site menu"
              className={cn(ICON_BUTTON, ICON_BUTTON_IDLE, 'lg:hidden')}
              data-nav-in
            >
              <MenuIcon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <MobileMenu
        open={menuOpen}
        active={active}
        onClose={() => setMenuOpen(false)}
        onNavigate={(id) => {
          pendingSection.current = id
          setMenuOpen(false)
        }}
        returnFocusTo={menuButton}
      />
    </>
  )
}

/** Shows the customer's initial when signed in, a person glyph otherwise. */
function AccountButton({ status, name, onClick }: { status: 'checking' | 'guest' | 'signed-in'; name: string | null; onClick: () => void }) {
  const initial = name ? (Array.from(name.trim())[0] ?? '').toUpperCase() : ''
  const label =
    status === 'guest' ? 'Log in or create an account' : name ? `Your account, signed in as ${name}` : 'Your account'
  return (
    <button
      id="account-button"
      type="button"
      onClick={onClick}
      aria-label={label}
      title={status === 'guest' ? 'Log in / Sign up' : 'Your account'}
      className={cn(ICON_BUTTON, status === 'signed-in' && initial ? 'border-ember/60 bg-ember/10 text-ember' : ICON_BUTTON_IDLE)}
      data-nav-in
    >
      {status === 'signed-in' && initial ? (
        <span aria-hidden="true" className="ui text-[1rem] leading-none">
          {initial}
        </span>
      ) : (
        <UserRound className="h-[1.1rem] w-[1.1rem]" strokeWidth={1.75} aria-hidden="true" />
      )}
    </button>
  )
}
