import { useMemo, useRef, type CSSProperties } from 'react'
import { BurgerLayers } from '../components/BurgerLayers'
import { BURGER_LAYERS, EXPLODE, INGREDIENT_STORIES, LAYER_BY_ID, STRETCH_REST, storyAnchor, type LayerId } from '../data/burger'
import { usePrefersReducedMotion } from '../hooks/useMediaQuery'
import { gsap, MOTION, ScrollTrigger, useGSAP } from '../lib/gsap'
import './ExplodedBurger.css'
import { HeroCopy } from './Hero'

/** The burger is drawn a little larger while the headline is on screen. */
const HERO_SCALE = { desktop: 1.16, compact: 1.08 }
/** How far the idle float lifts the burger, in px. */
const FLOAT = { desktop: 14, compact: 9 }
/** Length of the pinned scroll, in viewport heights. */
const PIN_LENGTH = { desktop: 6, compact: 5 }
/** Timeline units: when the first ingredient moves, and the spacing between ingredients. */
const FIRST_STEP = 1.15
const STEP = 1.6
/** Delay between layers that move in the same step (lettuce lifts, then the tomato slides out). */
const LAYER_STAGGER = 0.28

/**
 * The table shadow, the landing squash and the hero headline all follow the burger's real
 * outline, whichever art set is live. Set on the scene so the type layer can read them too.
 */
const [HEEL_X0, , HEEL_X1, HEEL_Y1] = LAYER_BY_ID['bottom-bun'].bbox
const BURGER_TOP = Math.min(...BURGER_LAYERS.map((l) => l.bbox[1]))
const BURGER_BOTTOM = Math.max(...BURGER_LAYERS.map((l) => l.bbox[3]))
const SCENE_VARS = {
  '--heel-l': `${HEEL_X0 / 10}%`,
  '--heel-r': `${100 - HEEL_X1 / 10}%`,
  '--heel-b': `${HEEL_Y1 / 10}%`,
  '--burger-top': BURGER_TOP / 1000,
  '--burger-bottom': BURGER_BOTTOM / 1000,
  '--hero-scale-desktop': HERO_SCALE.desktop,
  '--hero-scale-compact': HERO_SCALE.compact,
} as CSSProperties

const BURGER_LABEL =
  'A burger with a sesame brioche crown, butter lettuce, vine tomato, aged cheddar, a smashed beef patty, Theory sauce and a toasted heel.'

/**
 * SECTION 01 + 02 — one pinned scene.
 *
 * Scroll drives a single GSAP timeline: the headline leaves, then each ingredient
 * separates on its own sub-timeline while its caption appears, the burger holds fully
 * exploded, then reassembles before the pin releases into the showcase.
 *
 * Every animated property belongs to exactly one wrapper so effects never fight:
 *   [data-anim="lift"]   scroll: hero position (centred between the headline lines) → story centre
 *   [data-anim="scale"]  scroll: hero size → exploded size
 *   [data-anim="intro"]  page load: fade + scale in
 *   [data-anim="float"]  idle bob
 *   [data-anim="settle"] scroll: landing squash when the burger closes again
 *   [data-layer]         scroll: yPercent / xPercent / rotation / scale (load intro uses `y` px)
 *   [data-band="load"]   page load: light sweep across the crown
 *   [data-band="scroll"] scroll: light sweeps across the crown and the cheddar
 */
export function ExplodedBurger() {
  const root = useRef<HTMLElement>(null)
  const reduced = usePrefersReducedMotion()
  const anchors = useMemo(() => INGREDIENT_STORIES.map((story) => storyAnchor(story, EXPLODE.desktop)), [])

  useGSAP(
    () => {
      const scene = root.current
      if (!scene) return
      const q = gsap.utils.selector(scene)
      const layerEl = (id: LayerId) => scene.querySelector<HTMLElement>(`[data-layer="${id}"]`)!
      const layers = BURGER_LAYERS.map((l) => layerEl(l.id))

      const mm = gsap.matchMedia()
      mm.add(
        {
          desktop: `${MOTION.desktop} and ${MOTION.full}`,
          compact: `${MOTION.compact} and ${MOTION.full}`,
        },
        (context) => {
          const desktop = Boolean(context.conditions?.desktop)
          const offsets = desktop ? EXPLODE.desktop : EXPLODE.compact
          const stage = q('.scene-stage')[0] as HTMLElement
          const anchor = q('.hero-anchor')[0] as HTMLElement
          const lift = q('[data-anim="lift"]')
          const scaler = q('[data-anim="scale"]')
          const shadow = q('[data-anim="shadow"]')
          const glow = q('[data-anim="glow"]')
          const glowScroll = q('[data-anim="glow-scroll"]')
          const captions = q('.scene-caption')
          const leaders = q('.caption-leader')
          const rail = q('[data-anim="rail"]')
          const outro = q('[data-anim="outro"]')
          const settle = q('[data-anim="settle"]')
          const band = (id: LayerId, owner: 'load' | 'scroll') =>
            scene.querySelector<HTMLElement>(`[data-sheen="${id}"] [data-band="${owner}"]`)

          gsap.set(scaler, { scale: desktop ? HERO_SCALE.desktop : HERO_SCALE.compact })
          gsap.set(captions, { autoAlpha: 0 })
          gsap.set(leaders, { scaleX: 0 })
          gsap.set([rail, outro], { autoAlpha: 0 })
          gsap.set(outro, { y: 30 })

          /* 1 — Page-load entrance (waits for the display font so nothing reflows mid-reveal). */
          const intro = gsap.timeline({ paused: true, defaults: { ease: 'expo.out' } })
          intro
            .from(glow, { autoAlpha: 0, scale: 0.7, duration: 2.6 }, 0)
            .from(q('[data-anim="ambient"]'), { autoAlpha: 0, duration: 2.4, ease: 'power2.out' }, 0.1)
            .from(q('.guide-v'), { scaleY: 0, duration: 1.8, ease: 'expo.inOut' }, 0.1)
            .from(q('.guide-h'), { scaleX: 0, duration: 1.8, ease: 'expo.inOut' }, 0.25)
            .from(q('[data-anim="intro"]'), { autoAlpha: 0, scale: 0.84, duration: 2 }, 0.15)
            .from(layers, { y: (i: number) => -(i + 1) * (desktop ? 10 : 6), duration: 1.8, stagger: { each: 0.06, from: 'end' } }, 0.2)
            .from(q('.hero-line .line-inner'), { yPercent: 112, duration: 1.4, stagger: 0.14 }, 0.3)
            .from(q('[data-anim="hero-meta-in"]'), { autoAlpha: 0, y: 18, duration: 1.2, stagger: 0.12 }, 0.95)
            // Once the crown has settled, a studio light glides across the glaze.
            .to(band('top-bun', 'load'), { xPercent: 200, duration: 1.9, ease: 'power2.inOut' }, 1.15)

          let alive = true
          const play = () => {
            if (alive) intro.play()
          }
          const fallback = window.setTimeout(play, 1500)
          document.fonts?.ready.then(play)

          /* 2 — Idle float on its own wrapper. */
          const float = desktop ? FLOAT.desktop : FLOAT.compact
          const bob = gsap.to(q('[data-anim="float"]'), { y: -float, duration: 3.4, ease: 'sine.inOut', yoyo: true, repeat: -1 })

          // Performance: the endless loops (the bob, the scroll cue, the pointer glow) stop while the
          // scene is off screen, and pick up where they were when it comes back. The wrapper spans the
          // whole pinned scroll, so they keep running for as long as any of the scene can be seen.
          let onScreen = true
          const wrap = scene.closest('.scene-wrap') ?? scene
          const visibility = new IntersectionObserver(([entry]) => {
            onScreen = entry.isIntersecting
            scene.toggleAttribute('data-offscreen', !onScreen)
            if (onScreen) bob.resume()
            else bob.pause()
          })
          visibility.observe(wrap)

          // While the headline is up, the burger sits centred between its two lines (the CSS works
          // out where: .hero-anchor). Half the float is added so the bob is centred there too.
          // A function, so a resize re-measures it (invalidateOnRefresh).
          const heroLift = () => anchor.offsetTop - stage.offsetTop + float / 2

          /* 3 — The scroll story. */
          const tl = gsap.timeline({ defaults: { duration: 1, ease: 'power3.inOut' } })
          tl.to(q('.hero-line'), { yPercent: -45, autoAlpha: 0, duration: 0.8, ease: 'power2.in', stagger: 0.1 }, 0)
            .to(q('[data-anim="hero-meta"]'), { autoAlpha: 0, y: -16, duration: 0.5, ease: 'power2.in' }, 0)
            .fromTo(lift, { y: heroLift }, { y: 0, duration: 1.1 }, 0)
            .to(scaler, { scale: 1, duration: 1.1 }, 0)
            .to(glowScroll, { scale: 0.82, autoAlpha: 0.7, duration: 1.1 }, 0)
            .to(q('.guide'), { opacity: 1, duration: 0.8 }, 0.2)
            .to(rail, { autoAlpha: 1, duration: 0.5, ease: 'power2.out' }, 0.85)

          // Each ingredient gets its own timeline, placed on the master at its step.
          const starts = INGREDIENT_STORIES.map((story, i) => {
            const at = FIRST_STEP + i * STEP
            const step = gsap.timeline({ defaults: { ease: 'power3.inOut' } })
            story.layers.forEach((id, j) => {
              const o = offsets[id]
              const el = layerEl(id)
              const t = j * LAYER_STAGGER
              step.to(el, { yPercent: o.y, xPercent: o.x ?? 0, rotation: o.rotate ?? 0, duration: 0.95 }, t)
              // Melted cheddar pulls long as it lifts away, then relaxes (never quite back to flat).
              if (o.stretch) {
                const s = o.stretch
                step.to(
                  el,
                  { keyframes: { scaleY: [1, 1 + s, 1 + s * STRETCH_REST], scaleX: [1, 1 - s * 0.25, 1], easeEach: 'sine.inOut' }, duration: 0.95, ease: 'none' },
                  t,
                )
              }
              // Glossy layers catch the light as they move.
              const sweep = band(id, 'scroll')
              if (sweep) step.fromTo(sweep, { xPercent: 0 }, { xPercent: 200, duration: 0.9, ease: 'power1.inOut' }, t + 0.06)
            })
            // Layers underneath ride along with the lead layer so the stack never collapses onto itself.
            const leadY = offsets[story.layers[0]].y
            story.carry?.forEach((id) => step.to(layerEl(id), { yPercent: leadY, duration: 0.95 }, 0))
            const heelY = story.layers.includes('bottom-bun') ? offsets['bottom-bun'].y : story.carry?.includes('bottom-bun') ? leadY : null
            if (heelY !== null) {
              step.to(shadow, { y: () => (stage.offsetHeight * heelY) / 100, scaleX: 1 + heelY / 170, autoAlpha: 0.65, duration: 0.95 }, 0.1)
            }
            step.fromTo(captions[i], { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power2.out' }, 0.38)
            if (desktop) step.fromTo(leaders[i], { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: 'power2.out' }, 0.34)
            tl.add(step, at)
            return at
          })

          const last = starts.length - 1
          const holdEnd = starts[last] + STEP + 0.5
          starts.forEach((_, i) => {
            const at = i < last ? starts[i + 1] : holdEnd
            tl.to(captions[i], { autoAlpha: 0, y: -26, duration: 0.38, ease: 'power2.in' }, at)
            if (desktop) tl.to(leaders[i], { scaleX: 0, duration: 0.32, ease: 'power2.in' }, at)
          })

          // Back together: buns close in on the filling, the stack lands with a little give,
          // light runs over the crown once more, then the scene settles for the hand-off.
          const assembleAt = holdEnd + 0.2
          const crownSweep = band('top-bun', 'scroll')
          tl.to(
            layers,
            { yPercent: 0, xPercent: 0, rotation: 0, scaleX: 1, scaleY: 1, duration: 1.4, ease: 'power3.inOut', stagger: { each: 0.06, from: 'edges' } },
            assembleAt,
          )
            .to(shadow, { y: 0, scaleX: 1, autoAlpha: 1, duration: 1.4 }, assembleAt)
            .to(
              settle,
              { keyframes: { scaleY: [1, 0.972, 1.008, 1], scaleX: [1, 1.014, 0.997, 1], easeEach: 'sine.inOut' }, duration: 0.75, ease: 'none' },
              assembleAt + 1.12,
            )
            .to(rail, { autoAlpha: 0, duration: 0.5 }, assembleAt)
            .to(outro, { autoAlpha: 1, y: 0, duration: 0.7, ease: 'power2.out' }, assembleAt + 1.1)
            .to(scaler, { scale: 0.92, duration: 1.2, ease: 'power2.inOut' }, assembleAt + 1.15)
            .to(glowScroll, { autoAlpha: 1, scale: 1, duration: 1.2 }, assembleAt + 1.15)
          if (crownSweep) {
            tl.fromTo(crownSweep, { xPercent: 0 }, { xPercent: 200, duration: 1.1, ease: 'power1.inOut', immediateRender: false }, assembleAt + 1.3)
          }
          tl.to({}, { duration: 0.45 })

          // Progress rail follows the timeline itself (not raw scroll), so it matches what's on screen.
          const railItems = q('[data-rail-item]')
          const railFill = q('[data-anim="rail-fill"]')
          let current = -2
          let heroGone = false
          tl.eventCallback('onUpdate', () => {
            const t = tl.time()
            // The scroll cue is faded out by 0.5; stop its loop until the headline comes back.
            if (t > 0.55 !== heroGone) {
              heroGone = !heroGone
              scene.toggleAttribute('data-hero-gone', heroGone)
            }
            let index = -1
            starts.forEach((s, i) => {
              if (t >= s) index = i
            })
            if (t >= assembleAt) index = -1
            if (index !== current) {
              current = index
              railItems.forEach((el, i) => el.toggleAttribute('data-active', i === index))
            }
            gsap.set(railFill, { scaleX: gsap.utils.clamp(0, 1, (t - starts[0]) / (holdEnd - starts[0])) })
          })

          ScrollTrigger.create({
            trigger: scene,
            start: 'top top',
            end: () => `+=${window.innerHeight * (desktop ? PIN_LENGTH.desktop : PIN_LENGTH.compact)}`,
            pin: true,
            scrub: 0.7,
            animation: tl,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          })

          /* 4 — On desktop the warm key light drifts toward the pointer. */
          let onMove: ((e: PointerEvent) => void) | null = null
          if (desktop) {
            const follower = q('[data-anim="glow-follow"]')[0]
            const xTo = gsap.quickTo(follower, 'x', { duration: 1.8, ease: 'power3.out' })
            const yTo = gsap.quickTo(follower, 'y', { duration: 1.8, ease: 'power3.out' })
            onMove = (e: PointerEvent) => {
              if (!onScreen) return
              xTo((e.clientX / window.innerWidth - 0.5) * 110)
              yTo((e.clientY / window.innerHeight - 0.5) * 70)
            }
            window.addEventListener('pointermove', onMove, { passive: true })
          }

          return () => {
            alive = false
            window.clearTimeout(fallback)
            visibility.disconnect()
            scene.removeAttribute('data-offscreen')
            scene.removeAttribute('data-hero-gone')
            if (onMove) window.removeEventListener('pointermove', onMove)
          }
        },
      )
    },
    { scope: root },
  )

  return (
    <>
      {/* A dedicated parent so ScrollTrigger's pin-spacer never sits between React-managed siblings.
          It spans the whole pinned scroll, so the nav measures "Home" by it (data-nav-span). */}
      <div className="scene-wrap" data-nav-span>
        <section id="home" ref={root} tabIndex={-1} className="scene outline-none" style={SCENE_VARS} aria-labelledby="hero-title">
          <div className="scene-backdrop" aria-hidden="true">
            {/* Pointer drift → scroll dimming → load fade-in: one wrapper per owner. */}
            <div className="glow-follow" data-anim="glow-follow">
              <div className="glow-scroll" data-anim="glow-scroll">
                <div className="scene-glow" data-anim="glow" />
              </div>
            </div>
            <div className="scene-key" data-anim="ambient" />
            <div className="scene-floor" data-anim="ambient" />
            <span className="guide guide-v" />
            <span className="guide guide-h" />
            <div className="scene-vignette" />
          </div>

          <HeroCopy />
          <span className="hero-anchor" aria-hidden="true" />

          <div className="scene-stage">
            <div className="scene-lift" data-anim="lift">
              <div className="scene-scale" data-anim="scale">
                {/* The pool of light and the shadow share a hook, so both follow the heel. */}
                <div className="scene-pool" data-anim="shadow" />
                <div className="scene-shadow" data-anim="shadow" />
                <div className="absolute inset-0" data-anim="intro">
                  <div className="absolute inset-0" data-anim="float">
                    <div className="scene-settle" data-anim="settle">
                      <BurgerLayers priority composited sheen label={BURGER_LABEL} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="scene-captions" aria-hidden="true">
            {INGREDIENT_STORIES.map((story, i) => (
              <div
                key={story.id}
                className="scene-caption"
                data-side={story.side}
                style={{ '--ax': anchors[i].x.toFixed(2), '--ay': anchors[i].y.toFixed(2) } as CSSProperties}
              >
                <span className="caption-leader" />
                <div className="caption-body">
                  <p className="caption-detail ui">{story.detail}</p>
                  <p className="caption-title display">{story.title}</p>
                  <p className="caption-text">{story.body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="scene-rail" data-anim="rail" aria-hidden="true">
            <div className="rail-inner">
              <ol>
                {INGREDIENT_STORIES.map((story, i) => (
                  <li key={story.id} data-rail-item>
                    <span className="rail-index tabular">{String(i + 1).padStart(2, '0')}</span>
                    {story.short}
                  </li>
                ))}
              </ol>
              <span className="rail-track">
                <span className="rail-fill" data-anim="rail-fill" />
              </span>
            </div>
          </div>

          <p className="scene-outro display" data-anim="outro" aria-hidden="true">
            Seven layers. Zero shortcuts.
          </p>

          {!reduced && (
            <div className="sr-only">
              <h2>Inside the burger</h2>
              <ol>
                {INGREDIENT_STORIES.map((story) => (
                  <li key={story.id}>
                    {story.title}: {story.body}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      </div>

      {reduced && <AnatomyDiagram />}
    </>
  )
}

/** Reduced-motion alternative: the same story as a still, labelled exploded diagram. */
function AnatomyDiagram() {
  return (
    <section aria-labelledby="anatomy-title" className="border-t border-line bg-ink py-24 lg:py-32">
      <div className="shell grid items-start gap-14 lg:grid-cols-2">
        <div className="relative mx-auto aspect-[4/5] w-full max-w-[30rem] lg:sticky lg:top-24">
          <BurgerLayers
            offsets={EXPLODE.desktop}
            className="absolute inset-x-0 top-[12%]"
            label="The burger pulled apart into its layers: crown, lettuce, tomato, cheddar, beef patty, sauce and heel."
          />
        </div>
        <div>
          <h2 id="anatomy-title" className="display text-[clamp(3rem,7vw,6rem)] text-cream">
            Inside the burger
          </h2>
          <ol className="mt-10 space-y-8">
            {INGREDIENT_STORIES.map((story) => (
              <li key={story.id} className="border-t border-line pt-6">
                <p className="ui text-sm text-ember">{story.detail}</p>
                <h3 className="display mt-2 text-[2.2rem] text-cream">{story.title}</h3>
                <p className="mt-2 max-w-[46ch] text-bone/75">{story.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
