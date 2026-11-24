import { Beef, CookingPot, Wheat } from 'lucide-react'
import { useRef } from 'react'
import { SplitLines } from '../components/SplitLines'
import { gsap, MOTION, useGSAP } from '../lib/gsap'
import { revealImage, revealLines, revealUp } from '../lib/reveal'
import { cn } from '../lib/utils'
import './BrandStory.css'

/** Notes pinned to parts of the photo, in % of the frame. */
const NOTES = [
  { id: 'bun', x: 48, y: 29, label: 'Brioche, baked before sunrise', side: 'right' },
  { id: 'pickle', x: 31, y: 43.5, label: 'Pickles brined for five days', side: 'right' },
  { id: 'crust', x: 86, y: 57, label: 'Crust from a 230 °C griddle', side: 'left' },
] as const

const COMMITMENTS = [
  { icon: Beef, title: 'Ground every morning', body: 'Whole chuck and brisket, never frozen, smashed within hours.' },
  { icon: Wheat, title: 'Baked before sunrise', body: 'Brioche and potato buns from our own oven, toasted to order.' },
  { icon: CookingPot, title: 'Made in-house', body: 'Sauces, pickles and slaw. No pouches, no shortcuts.' },
]

/** SECTION 04 — an editorial spread on cream: one big photograph, annotated like a diagram. */
export function BrandStory() {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const section = root.current!
      const q = gsap.utils.selector(section)
      const mm = gsap.matchMedia()
      mm.add(MOTION.full, () => {
        const frame = q('[data-anim="frame"]')[0]
        revealImage(frame, frame.querySelector('img'))
        revealImage(q('[data-anim="inset"]')[0], q('[data-anim="inset"] img')[0], { delay: 0.35 })
        revealLines(q('[data-line]'), q('h2')[0])
        revealUp(q('[data-reveal]'), q('[data-reveal]')[0], { stagger: 0.1 })
        revealUp(q('[data-commitment]'), q('[data-commitment]')[0], { stagger: 0.12 })

        // Notes draw in once the photo has opened.
        const notes = gsap.timeline({ scrollTrigger: { trigger: frame, start: 'top 55%', once: true }, delay: 0.6 })
        notes
          .from(q('.note-dot'), { scale: 0, duration: 0.5, ease: 'back.out(2)', stagger: 0.18 })
          .from(q('.note-line'), { scaleX: 0, duration: 0.6, ease: 'power3.out', stagger: 0.18 }, 0.15)
          .from(q('.note-label'), { autoAlpha: 0, x: (i: number) => (NOTES[i].side === 'right' ? -10 : 10), duration: 0.6, stagger: 0.18 }, 0.35)

        // A slow drift inside the frame while the spread passes.
        gsap.fromTo(
          frame.querySelector('[data-anim="drift"]'),
          { yPercent: -4 },
          { yPercent: 4, ease: 'none', scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: true } },
        )
      })
    },
    { scope: root },
  )

  return (
    <section id="story" ref={root} tabIndex={-1} aria-labelledby="story-title" className="relative overflow-hidden bg-cream text-ink outline-none">
      <div className="shell grid gap-16 py-24 lg:grid-cols-12 lg:gap-x-10 lg:py-40">
        <figure className="relative lg:col-span-6">
          <div data-anim="frame" className="relative aspect-[4/5] overflow-hidden bg-ink">
            <div data-anim="drift" className="absolute inset-[-5%]">
              <img
                src="/images/story/smash-double-1600.webp"
                srcSet="/images/story/smash-double-800.webp 800w, /images/story/smash-double-1600.webp 1600w"
                sizes="(min-width: 1024px) 46vw, 100vw"
                alt="A double smash burger with melted cheese and pickles on a dark table"
                width={1600}
                height={2400}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </div>
            {NOTES.map((note) => (
              <span
                key={note.id}
                className="note"
                data-side={note.side}
                style={note.side === 'right' ? { left: `calc(${note.x}% - 5px)`, top: `${note.y}%` } : { right: `calc(${100 - note.x}% - 5px)`, top: `${note.y}%` }}
                aria-hidden="true"
              >
                <span className="note-dot" />
                <span className="note-line" />
                <span className="note-label ui">{note.label}</span>
              </span>
            ))}
          </div>
          <div
            data-anim="inset"
            className="absolute -bottom-10 right-4 aspect-[4/5] w-[38%] overflow-hidden border-[6px] border-cream bg-ink shadow-[0_30px_60px_-30px_rgba(9,9,9,0.6)] sm:-right-8 lg:-right-14"
          >
            <img
              src="/images/story/vine-tomatoes-800.webp"
              alt="Vine tomatoes with drops of water on a black background"
              width={800}
              height={1000}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          </div>
          <figcaption className="sr-only">
            Our double smash burger. Brioche baked before sunrise, pickles brined for five days, and a crust from a 230 °C griddle.
          </figcaption>
        </figure>

        <div className="flex flex-col justify-center lg:col-span-5 lg:col-start-8">
          <SplitLines as="h2" id="story-title" lines={['Good food.', 'No shortcuts.']} className="display text-[clamp(3.4rem,7vw,6.8rem)]" />
          <div className="mt-10 space-y-5 text-[1.22rem] leading-[1.65] text-ink/80">
            <p data-reveal>
              We started Burger Theory with one rule: if it can be made in our kitchen, it is made in our kitchen. The beef is ground from whole
              chuck and brisket every morning. The brioche leaves the oven before sunrise. The pickles sit in brine for five days, and the sauce
              recipe lives on a single index card.
            </p>
            <p data-reveal>It takes longer. It costs more. You can taste it in the first bite.</p>
          </div>
          <ul className="mt-12 grid gap-7 border-t border-ink/15 pt-10 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {COMMITMENTS.map(({ icon: Icon, title, body }) => (
              <li key={title} data-commitment>
                <Icon className="h-6 w-6 text-ember-deep" aria-hidden="true" />
                <h3 className="display-sm mt-4 text-[1.35rem]">{title}</h3>
                <p className="mt-2 text-[0.98rem] leading-relaxed text-ink/70">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <span className={cn('pointer-events-none absolute inset-x-0 top-0 h-px bg-ink/10')} aria-hidden="true" />
    </section>
  )
}
