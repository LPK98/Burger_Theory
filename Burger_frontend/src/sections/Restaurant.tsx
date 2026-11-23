import { MapPin } from 'lucide-react'
import { useRef } from 'react'
import { HoursCard } from '../components/HoursCard'
import { SplitLines } from '../components/SplitLines'
import { TextSkeleton } from '../components/TextSkeleton'
import { addressLines, useRestaurantProfile } from '../hooks/useRestaurantProfile'
import { gsap, MOTION, useGSAP } from '../lib/gsap'
import { revealImage, revealLines, revealUp } from '../lib/reveal'
import { cn } from '../lib/utils'

interface PhotoProps {
  name: string
  alt: string
  frame: string
  sizes: string
  className?: string
}

/** A photo in a clipping frame (opened by the reveal). Two widths are served for sharp, light images. */
function Photo({ name, alt, frame, sizes, className }: PhotoProps) {
  return (
    <figure data-photo className={cn('relative overflow-hidden bg-ink', frame, className)}>
      <img
        src={`/images/restaurant/${name}-1600.webp`}
        srcSet={`/images/restaurant/${name}-800.webp 800w, /images/restaurant/${name}-1600.webp 1600w`}
        sizes={sizes}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
      />
    </figure>
  )
}

/** A tiny drafted street map with the restaurant pinned on it (placeholder location). */
function StreetSketch() {
  return (
    <svg viewBox="0 0 320 160" className="h-auto w-full" aria-hidden="true" focusable="false">
      <rect width="320" height="160" fill="#101010" />
      <g stroke="rgba(244,233,216,0.14)" strokeWidth="9" strokeLinecap="square" fill="none">
        <path d="M-10 52H330M-10 118H330M70 -10V170M196 -10V170M262 -10L300 170" />
      </g>
      <g stroke="rgba(244,233,216,0.07)" strokeWidth="3" fill="none">
        <path d="M-10 86H330M132 -10V170M20 -10V170" />
      </g>
      <path d="M70 118H196" stroke="#F07832" strokeWidth="3" strokeDasharray="1 7" strokeLinecap="round" fill="none" />
      <circle cx="196" cy="86" r="18" fill="rgba(240,120,50,0.16)" />
      <circle cx="196" cy="86" r="7" fill="#F07832" />
      <text x="210" y="74" fill="#F4E9D8" fontSize="11" fontFamily="Anybody Variable, sans-serif" fontWeight="700">BUN THEORY</text>
      <text x="76" y="111" fill="rgba(244,233,216,0.5)" fontSize="9" fontFamily="Anybody Variable, sans-serif">EMBER ST</text>
    </svg>
  )
}

/** SECTION 06 — the room: an off-grid collage of the space, the grill and the food, plus hours and address. */
export function Restaurant() {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const section = root.current!
      const q = gsap.utils.selector(section)
      const mm = gsap.matchMedia()
      mm.add(MOTION.full, () => {
        revealLines(q('[data-line]'), q('h2')[0])
        revealUp(q('[data-reveal]'), q('[data-reveal]')[0], { stagger: 0.1 })
        q('[data-photo]').forEach((photo) => revealImage(photo, photo.querySelector('img')))
        q('[data-card]').forEach((card) => revealUp(card, card))
        // The right-hand column drifts at a different speed: depth without moving the content you read.
        gsap.fromTo(
          q('[data-anim="column"]'),
          { y: 60 },
          { y: -60, ease: 'none', scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: true } },
        )
      })
    },
    { scope: root },
  )

  return (
    <section id="visit" ref={root} tabIndex={-1} aria-labelledby="visit-title" className="relative overflow-hidden bg-char py-24 outline-none lg:py-40">
      <div className="shell grid gap-6 lg:grid-cols-12 lg:gap-x-8">
        <div className="flex flex-col gap-6 lg:col-span-7">
          <header className="pb-6 lg:pb-14">
            <SplitLines as="h2" id="visit-title" lines={['Pull up', 'a stool.']} className="display text-[clamp(3.9rem,9vw,9rem)] text-cream" />
            <p data-reveal className="mt-8 max-w-[44ch] text-[1.15rem] leading-relaxed text-bone/75">
              Forty seats around an open grill, a long bar for eating alone, and a playlist we argue about. Walk in any time. Groups of six or
              more, call ahead.
            </p>
          </header>

          <Photo
            name="grill-flame"
            alt="A cook at the stove as flame bursts from the pan"
            frame="aspect-[16/10]"
            sizes="(min-width: 1024px) 55vw, 100vw"
          />

          <div className="grid gap-6 sm:grid-cols-2">
            <HoursCard />
            <Photo
              name="burger-closeup"
              alt="Close-up of a burger with melted cheese, barbecue sauce and lettuce"
              frame="aspect-[4/5]"
              sizes="(min-width: 1024px) 27vw, (min-width: 640px) 50vw, 100vw"
            />
          </div>
        </div>

        <div data-anim="column" className="flex flex-col gap-6 lg:col-span-5 lg:pt-44">
          <Photo
            name="dining-room"
            alt="The dining room at night: teal walls, warm pendant lights and wooden chairs"
            frame="aspect-[3/4]"
            sizes="(min-width: 1024px) 38vw, 100vw"
          />
          <div data-card className="border border-line bg-ink p-7 lg:p-8">
            <div className="flex items-center gap-3">
              <MapPin className="h-5 w-5 text-ember" aria-hidden="true" />
              <h3 className="display text-[2.4rem] text-cream">Find us</h3>
            </div>
            <div className="mt-6 overflow-hidden rounded-[3px] border border-line">
              <StreetSketch />
            </div>
            <FindUsAddress />
            <p className="mt-3 text-sm text-ash">Location shown is a placeholder until the restaurant address is confirmed.</p>
          </div>
        </div>

        <Photo
          name="bar"
          alt="The bar: chalkboard menus, bottles and a row of stools"
          frame="aspect-[16/10] sm:aspect-[21/9]"
          sizes="(min-width: 1440px) 1360px, 100vw"
          className="lg:col-span-12 lg:mt-20"
        />
      </div>
    </section>
  )
}

/** The address set in the admin portal (Settings). */
function FindUsAddress() {
  const { profile, status } = useRestaurantProfile()
  if (!profile) return status === 'error' ? null : <TextSkeleton className="mt-7 block w-48" />
  const { street, area } = addressLines(profile.address)
  return (
    <address className="mt-6 not-italic leading-relaxed text-cream">
      {street}
      {street && area && <br />}
      <span className="text-bone/70">{area}</span>
    </address>
  )
}
