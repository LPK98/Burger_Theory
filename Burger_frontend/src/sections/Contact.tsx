import { Mail, MapPin, Phone } from 'lucide-react'
import { useRef } from 'react'
import { BurgerLayers } from '../components/BurgerLayers'
import { Button, ButtonLink } from '../components/Button'
import { SocialLinks } from '../components/SocialIcons'
import { SplitLines } from '../components/SplitLines'
import { TextSkeleton } from '../components/TextSkeleton'
import { addressLines, phoneHref, socialLinks, useRestaurantProfile } from '../hooks/useRestaurantProfile'
import { useGoToSection } from '../hooks/useSectionNav'
import { gsap, MOTION, useGSAP } from '../lib/gsap'
import { revealLines, revealUp } from '../lib/reveal'
import { cn } from '../lib/utils'
import { EmailText } from '../components/EmailText'

/** SECTION 07 — the final call: the burger builds itself one last time, layer by layer. */
export function Contact() {
  const root = useRef<HTMLElement>(null)
  const goTo = useGoToSection()
  const { profile, status } = useRestaurantProfile()
  const loading = !profile && status !== 'error'
  const address = profile ? addressLines(profile.address) : null
  const addressText = address ? [address.street, address.area].filter(Boolean).join(', ') : ''
  const hasSocial = socialLinks(profile).length > 0

  useGSAP(
    () => {
      const section = root.current!
      const q = gsap.utils.selector(section)
      const mm = gsap.matchMedia()
      mm.add(MOTION.full, () => {
        revealLines(q('[data-line]'), q('h2')[0])
        revealUp(q('[data-reveal]'), q('[data-reveal]')[0], { stagger: 0.1 })

        // Heel first, crown last: each layer drops onto the one below.
        const stage = q('[data-anim="build"]')[0]
        const build = gsap.timeline({ scrollTrigger: { trigger: stage, start: 'top 72%', once: true } })
        build
          .from(q('[data-anim="build"] [data-layer]'), {
            yPercent: (i: number) => -55 - i * 9,
            autoAlpha: 0,
            duration: 0.95,
            ease: 'power3.out',
            stagger: 0.11,
          })
          .from(q('[data-anim="cta-glow"]'), { autoAlpha: 0, scale: 0.6, duration: 1.8, ease: 'expo.out' }, 0)
      })
    },
    { scope: root },
  )

  return (
    <section id="contact" ref={root} tabIndex={-1} aria-labelledby="contact-title" className="relative overflow-hidden border-t border-line bg-ink outline-none">
      <div className="shell grid items-center gap-14 py-24 lg:grid-cols-12 lg:py-36">
        <div className="relative z-10 lg:col-span-7">
          <SplitLines
            as="h2"
            id="contact-title"
            lines={['Your next', 'obsession is', 'one bite away.']}
            className="display text-[clamp(3.4rem,8.2vw,8.5rem)] text-cream"
          />
          <div data-reveal className="mt-10 flex flex-wrap gap-4">
            <Button size="lg" onClick={() => goTo('menu')}>
              Order now
            </Button>
            {profile?.phone && (
              <ButtonLink size="lg" variant="outline" href={phoneHref(profile.phone)} icon={<Phone className="h-4 w-4" aria-hidden="true" />}>
                Call the restaurant
              </ButtonLink>
            )}
          </div>

          <dl data-reveal className="mt-14 grid gap-8 border-t border-line pt-10 sm:grid-cols-3">
            {(loading || profile?.phone) && (
              <div>
                <dt className="ui flex items-center gap-2 text-sm text-ash">
                  <Phone className="h-4 w-4 text-ember" aria-hidden="true" />
                  Phone
                </dt>
                <dd className="mt-2">
                  {profile?.phone ? (
                    <a href={phoneHref(profile.phone)} className="ui text-cream transition-colors hover:text-ember">
                      {profile.phone}
                    </a>
                  ) : (
                    <TextSkeleton className="w-32" />
                  )}
                </dd>
              </div>
            )}
            {(loading || profile?.email) && (
              <div>
                <dt className="ui flex items-center gap-2 text-sm text-ash">
                  <Mail className="h-4 w-4 text-ember" aria-hidden="true" />
                  Email
                </dt>
                <dd className="mt-2">
                  {profile?.email ? (
                    <a href={`mailto:${profile.email}`} className="ui [overflow-wrap:anywhere] text-cream transition-colors hover:text-ember">
                      <EmailText email={profile.email} />
                    </a>
                  ) : (
                    <TextSkeleton />
                  )}
                </dd>
              </div>
            )}
            {(loading || addressText) && (
              <div>
                <dt className="ui flex items-center gap-2 text-sm text-ash">
                  <MapPin className="h-4 w-4 text-ember" aria-hidden="true" />
                  Address
                </dt>
                <dd className="mt-2 text-cream">{addressText || <TextSkeleton />}</dd>
              </div>
            )}
          </dl>

          {/* Stays in the layout (hidden) without links, so the reveal animation keeps its target. */}
          <div data-reveal className={cn('mt-10 items-center gap-5', hasSocial ? 'flex' : 'hidden')}>
            <p className="ui text-sm text-ash">Follow the grill</p>
            <SocialLinks />
          </div>
        </div>

        <div className="relative lg:col-span-5">
          <div
            data-anim="cta-glow"
            aria-hidden="true"
            className="absolute inset-[-25%] bg-[radial-gradient(closest-side,rgba(240,120,50,0.38),rgba(240,120,50,0.1)_50%,transparent_72%)]"
          />
          <div data-anim="build" className="relative mx-auto w-full max-w-[34rem]">
            <BurgerLayers label="A burger stacked layer by layer: heel, sauce, beef, cheddar, tomato, lettuce and a sesame crown." />
          </div>
        </div>
      </div>
    </section>
  )
}
