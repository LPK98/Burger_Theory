import { ArrowUpRight, MapPin } from 'lucide-react'
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
          <FindUsCard />
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

/**
 * Google's map tiles are light; this turns them into a dark map that keeps the hues (the red pin
 * stays red), so it sits in the black card. The hover state lifts it a little.
 */
const MAP_TONE =
  '[filter:invert(0.9)_hue-rotate(180deg)_saturate(0.6)_brightness(0.92)_contrast(0.9)] group-hover:[filter:invert(0.9)_hue-rotate(180deg)_saturate(0.8)_brightness(1.08)_contrast(0.95)]'

/**
 * The Find us card: the embedded Google map and the address, both set in the admin portal
 * (Settings). With a Google Maps link set, a link laid over the whole card opens it in a new
 * tab (an iframe can't sit inside a link), and the map underneath is for looking at only.
 * Without an embed it falls back to the drawn street map. Same frame as the Hours card.
 */
function FindUsCard() {
  const { profile, status } = useRestaurantProfile()
  const mapsUrl = profile?.maps_url ?? null
  const embedUrl = profile?.maps_embed_url ?? null
  const { street, area } = profile ? addressLines(profile.address) : { street: '', area: '' }
  const place = [street, area].filter(Boolean).join(', ')

  return (
    <div data-card className={cn('relative border border-line bg-ink p-7 lg:p-8', mapsUrl && 'group transition-colors duration-500 hover:border-ember/45')}>
      <div className="flex items-center gap-3">
        <MapPin className="h-5 w-5 text-ember" aria-hidden="true" />
        <h3 className="display text-[2.4rem] text-cream">Find us</h3>
      </div>
      <div className="mt-6 aspect-[2/1] overflow-hidden rounded-[3px] border border-line bg-char transition-[border-color,box-shadow] duration-500 group-hover:border-ember/50 group-hover:shadow-[0_0_44px_-10px_rgba(240,120,50,0.55)]">
        {embedUrl ? (
          <iframe
            src={embedUrl}
            title={`Map of ${place || 'the restaurant'}`}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            // Under the card link the map is a picture; on its own it can be panned and zoomed.
            tabIndex={mapsUrl ? -1 : undefined}
            className={cn('h-full w-full border-0 transition-[filter] duration-500', MAP_TONE, mapsUrl && 'pointer-events-none')}
          />
        ) : profile || status === 'error' ? (
          <div className="transition-[filter] duration-500 group-hover:brightness-[1.18]">
            <StreetSketch />
          </div>
        ) : null}
      </div>
      {profile ? (
        <address className="mt-6 not-italic leading-relaxed text-cream">
          {street}
          {street && area && <br />}
          <span className="text-bone/70">{area}</span>
        </address>
      ) : status === 'error' ? null : (
        <TextSkeleton className="mt-7 block w-48" />
      )}
      {mapsUrl && (
        <>
          <p className="ui mt-4 inline-flex items-center gap-1 text-sm text-ember" aria-hidden="true">
            View on Google Maps
            <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </p>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Find us on Google Maps${place ? `: ${place}` : ''} (opens in a new tab)`}
            className="absolute inset-0 z-10 cursor-pointer"
          />
        </>
      )}
    </div>
  )
}
