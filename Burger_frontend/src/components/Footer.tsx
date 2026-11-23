import { ArrowUp } from 'lucide-react'
import { useRef } from 'react'
import { openHoursDialog, useOpeningHours } from '../hooks/useOpeningHours'
import { addressLines, phoneHref, useRestaurantProfile } from '../hooks/useRestaurantProfile'
import { TextSkeleton } from './TextSkeleton'
import { groupWeek, statusCopy } from '../lib/opening-hours'
import { StatusDot } from './HoursStatus'
import { NAV_LINKS, SITE } from '../data/site'
import { useLenis } from '../hooks/useLenis'
import { useGoToSection } from '../hooks/useSectionNav'
import { gsap, MOTION, useGSAP } from '../lib/gsap'
import { revealUp } from '../lib/reveal'
import { Logo } from './Logo'
import { SocialLinks } from './SocialIcons'
import { EmailText } from './EmailText'

const WORDMARK = 'Bun Theory'
const YEAR = new Date().getFullYear()

export function Footer() {
  const root = useRef<HTMLElement>(null)
  const { scrollTo } = useLenis()
  const goTo = useGoToSection()

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION.full, () => {
        const footer = root.current!
        revealUp(footer.querySelectorAll('[data-reveal]'), footer, { stagger: 0.1 })
        gsap.from(footer.querySelectorAll('[data-letter]'), {
          yPercent: 100,
          duration: 1.4,
          ease: 'expo.out',
          stagger: 0.045,
          scrollTrigger: { trigger: footer.querySelector('[data-wordmark]'), start: 'top 96%', once: true },
        })
      })
    },
    { scope: root },
  )

  return (
    <footer ref={root} className="relative overflow-hidden border-t border-line bg-ink">
      <div className="shell grid gap-12 pb-16 pt-20 md:grid-cols-2 lg:grid-cols-12 lg:pt-28">
        <div data-reveal className="lg:col-span-4">
          <Logo />
          <p className="mt-5 max-w-[32ch] text-bone/70">Smashed burgers, built layer by layer, on one very hot griddle.</p>
          <SocialLinks className="mt-8" />
        </div>

        <nav data-reveal aria-label="Footer" className="lg:col-span-2">
          <h2 className="ui text-sm text-ash">Explore</h2>
          <ul className="mt-5 space-y-3">
            {NAV_LINKS.map((link) => (
              <li key={link.id}>
                <a
                  href={`#${link.id}`}
                  onClick={(event) => {
                    event.preventDefault()
                    goTo(link.id)
                  }}
                  className="ui text-cream/85 transition-colors hover:text-ember"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div data-reveal className="lg:col-span-3">
          <h2 className="ui text-sm text-ash">Visit</h2>
          <FooterAddress />
          <FooterHours />
        </div>

        <div data-reveal className="lg:col-span-3">
          <h2 className="ui text-sm text-ash">Contact</h2>
          <FooterContact />
        </div>
      </div>

      <p
        data-wordmark
        aria-hidden="true"
        className="display pointer-events-none flex select-none justify-center overflow-hidden whitespace-nowrap px-2 text-[21.5vw] leading-[0.8] text-cream/[0.07]"
      >
        {WORDMARK.split('').map((letter, i) => (
          <span key={i} data-letter className="inline-block">
            {letter === ' ' ? ' ' : letter}
          </span>
        ))}
      </p>

      <div className="shell flex flex-col gap-4 border-t border-line py-6 text-sm text-ash sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {YEAR} {SITE.name}. All rights reserved.
        </p>
        <button type="button" onClick={() => scrollTo(0)} className="ui inline-flex items-center gap-2 text-cream/80 transition-colors hover:text-ember">
          Back to top
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </footer>
  )
}

/** The week from the API, grouped, plus a live status line that opens the full schedule. */
function FooterHours() {
  const { data } = useOpeningHours()
  if (!data) return <div className="mt-5 h-[4.5rem] animate-pulse rounded-[2px] bg-cream/[0.04]" aria-hidden="true" />
  const copy = statusCopy(data)
  return (
    <>
      <dl className="mt-5 space-y-1.5 text-[0.95rem]">
        {groupWeek(data.weekly).map((h) => (
          <div key={h.days} className="flex justify-between gap-4 text-bone/70">
            <dt>{h.days}</dt>
            <dd className="ui tabular text-cream/85">{h.time}</dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        onClick={openHoursDialog}
        aria-haspopup="dialog"
        className="ui mt-4 inline-flex items-center gap-2 text-sm text-cream/85 transition-colors hover:text-ember"
      >
        <StatusDot tone={copy.tone} />
        {copy.label} · Full hours &amp; holidays
      </button>
    </>
  )
}

/** The address set in the admin portal (Settings). */
function FooterAddress() {
  const { profile, status } = useRestaurantProfile()
  if (!profile) return status === 'error' ? null : <TextSkeleton className="mt-6 block w-44" />
  const { street, area } = addressLines(profile.address)
  if (!street && !area) return null
  return (
    <address className="mt-5 not-italic leading-relaxed text-cream/85">
      {street}
      {street && area && <br />}
      {area}
    </address>
  )
}

/** Phone and email set in the admin portal (Settings). */
function FooterContact() {
  const { profile, status } = useRestaurantProfile()
  if (!profile) return status === 'error' ? null : <TextSkeleton className="mt-6 block w-40" />
  return (
    <ul className="mt-5 space-y-3">
      {profile.phone && (
        <li>
          <a href={phoneHref(profile.phone)} className="ui text-cream/85 transition-colors hover:text-ember">
            {profile.phone}
          </a>
        </li>
      )}
      {profile.email && (
        <li>
          <a href={`mailto:${profile.email}`} className="ui [overflow-wrap:anywhere] text-cream/85 transition-colors hover:text-ember">
            <EmailText email={profile.email} />
          </a>
        </li>
      )}
    </ul>
  )
}
