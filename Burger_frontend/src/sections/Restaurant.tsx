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

/** The restaurant's exact position. The Find us card opens it in Google Maps and the embed is centred on it. */
const MAPS_COORDS = '7.0939121,80.3179989'
const MAPS_URL = `https://www.google.com/maps?q=${MAPS_COORDS}`
const MAPS_EMBED_URL = `https://www.google.com/maps?q=${MAPS_COORDS}&z=17&output=embed`

/**
 * The live Google Map. It sits above the card's stretched link (z-10), so drag, zoom and the map's
 * own controls keep working; everywhere else on the card opens Google Maps.
 * The filter tones Google's light tiles down to the dark palette (hue-rotate keeps the red pin red).
 */
function LiveMap() {
  return (
    <div className="relative z-10 mt-6 aspect-[4/3] overflow-hidden sm:aspect-[2/1] rounded-[3px] border border-line bg-[#101010]">
      <iframe
        src={MAPS_EMBED_URL}
        title="Map showing Bun Theory's location"
        loading="lazy"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className="absolute inset-0 h-full w-full border-0 [filter:invert(0.9)_hue-rotate(180deg)_saturate(0.75)_brightness(0.95)]"
      />
    </div>
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
          <div
            data-card
            className="group relative cursor-pointer border border-line bg-ink p-7 transition-[border-color,box-shadow] duration-500 hover:border-ember/45 hover:shadow-[0_0_32px_-12px_rgba(240,120,50,0.35)] lg:p-8"
          >
            <div className="flex items-center gap-3">
              <MapPin className="h-5 w-5 text-ember" aria-hidden="true" />
              <h3 className="display text-[2.4rem] text-cream">
                {/* Stretched link: its ::after covers the whole card, so the card is one link. */}
                <a
                  href={MAPS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="uppercase focus-visible:outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:outline-2 focus-visible:after:outline-offset-4 focus-visible:after:outline-ember"
                >
                  Find us
                  <span className="sr-only">: open Bun Theory in Google Maps (new tab)</span>
                </a>
              </h3>
            </div>
            <LiveMap />
            <FindUsAddress />
            <p className="mt-3 flex justify-end text-sm">
              <span className="ui inline-flex items-center gap-1 text-ember" aria-hidden="true">
                View on Google Maps
                <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </span>
            </p>
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
