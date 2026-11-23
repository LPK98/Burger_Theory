import { CalendarDays, Megaphone, RotateCw, X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useLenis } from '../hooks/useLenis'
import { closeHoursDialog, refreshOpeningHours, useOpeningHours } from '../hooks/useOpeningHours'
import { gsap, useGSAP } from '../lib/gsap'
import { DAY_NAME, formatDate, formatDateRange, formatRange, statusCopy } from '../lib/opening-hours'
import { cn, prefersReducedMotion } from '../lib/utils'
import type { OpeningHoursInfo } from '../services/api/types'
import { StatusBadge, StatusDot } from './HoursStatus'

/**
 * The full opening hours: live status, any announcement, the week with today highlighted
 * (special dates applied) and upcoming holidays. Same shell and motion as the account dialog.
 */
export function HoursDialog() {
  const { data, status, dialogOpen: open } = useOpeningHours()
  const { lock, unlock } = useLenis()

  const root = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const firstRun = useRef(true)
  const titleId = useId()
  const statusId = useId()

  useFocusTrap(panel, open, closeHoursDialog)

  useEffect(() => {
    if (!open) return
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    lock()
    const timer = window.setTimeout(() => closeButton.current?.focus(), 80)
    return () => {
      window.clearTimeout(timer)
      unlock()
      returnFocus?.focus({ preventScroll: true })
    }
  }, [open, lock, unlock])

  useGSAP(
    () => {
      const overlay = root.current?.querySelector('[data-overlay]') ?? []
      const rows = root.current?.querySelectorAll('[data-row]') ?? []
      if (firstRun.current) {
        firstRun.current = false
        gsap.set(overlay, { autoAlpha: 0 })
        gsap.set(panel.current, { autoAlpha: 0, y: 40 })
        if (!open) return
      }
      const speed = prefersReducedMotion() ? 0 : 1
      if (open) {
        gsap.set(root.current, { visibility: 'visible' })
        gsap.to(overlay, { autoAlpha: 1, duration: 0.4 * speed, ease: 'power2.out', overwrite: true })
        gsap.to(panel.current, { autoAlpha: 1, y: 0, duration: 0.75 * speed, ease: 'expo.out', overwrite: true })
        if (speed) gsap.fromTo(rows, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'expo.out', stagger: 0.035, delay: 0.12, overwrite: true })
      } else {
        gsap.to(panel.current, { autoAlpha: 0, y: 24, duration: 0.35 * speed, ease: 'power2.in', overwrite: true })
        gsap.to(overlay, {
          autoAlpha: 0,
          duration: 0.35 * speed,
          delay: 0.05 * speed,
          overwrite: true,
          onComplete: () => {
            gsap.set(root.current, { visibility: 'hidden' })
          },
        })
      }
    },
    { scope: root, dependencies: [open] },
  )

  return (
    <div ref={root} className="invisible fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4" inert={!open}>
      <div data-overlay className="absolute inset-0 bg-black/75" onClick={closeHoursDialog} aria-hidden="true" />
      <section
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={data ? statusId : undefined}
        className="relative flex max-h-[92dvh] w-full flex-col border-line bg-char shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)] max-sm:border-t sm:max-h-[calc(100dvh-2rem)] sm:max-w-[34rem] sm:rounded-[3px] sm:border"
      >
        <header className="flex items-start justify-between gap-4 px-6 pt-6 sm:px-8 sm:pt-7">
          <div className="min-w-0">
            <p className="ui text-[0.75rem] uppercase tracking-[0.18em] text-ember">Visit us</p>
            <h2 id={titleId} className="display mt-2 text-[2.6rem] text-cream">
              Opening hours
            </h2>
          </div>
          <button
            ref={closeButton}
            type="button"
            onClick={closeHoursDialog}
            aria-label="Close"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-cream/20 text-cream transition-colors hover:border-ember hover:text-ember"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="mt-5 overflow-y-auto overscroll-contain px-6 pb-7 [scrollbar-color:var(--color-line)_transparent] [scrollbar-width:thin] sm:px-8" data-lenis-prevent>
          {data ? (
            <HoursBody info={data} statusId={statusId} />
          ) : status === 'error' ? (
            <div className="border border-line bg-ink p-6 text-center">
              <p className="text-bone/80">We couldn’t load the opening hours just now.</p>
              <button
                type="button"
                onClick={() => void refreshOpeningHours()}
                className="ui mt-4 inline-flex h-11 items-center gap-2 rounded-full border border-cream/20 px-5 text-sm text-cream transition-colors hover:border-ember hover:text-ember"
              >
                <RotateCw className="h-4 w-4" aria-hidden="true" />
                Try again
              </button>
            </div>
          ) : (
            <div className="space-y-3" aria-busy="true" aria-label="Loading opening hours">
              <div className="h-28 animate-pulse bg-ink" />
              {Array.from({ length: 7 }, (_, i) => (
                <div key={i} className="h-11 animate-pulse bg-ink/70" />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function HoursBody({ info, statusId }: { info: OpeningHoursInfo; statusId: string }) {
  const copy = statusCopy(info)
  const reason = info.status.reason
  // The coming seven days by weekday, so each row of the regular week shows this week's real hours.
  const thisWeek = new Map(info.week.map((d) => [d.day, d]))
  const upcoming = info.special_dates.filter((s) => !s.is_past)

  return (
    <>
      <div data-row id={statusId} aria-live="polite" className="relative overflow-hidden border border-line bg-ink p-5 sm:p-6">
        <div
          className={cn('pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full blur-3xl', copy.tone === 'closed' ? 'bg-cream/[0.04]' : 'bg-ember/20')}
          aria-hidden="true"
        />
        <StatusBadge copy={copy} />
        <p className="display-sm mt-4 text-[1.65rem] text-cream sm:text-[1.9rem]">{copy.detail}</p>
        {reason && (
          <p className="mt-2 text-[0.98rem] leading-relaxed text-bone/70">
            <span className="text-ember">{reason.title}.</span> {reason.note}
          </p>
        )}
      </div>

      {info.announcement && (
        <div data-row className="mt-4 flex gap-3 border-l-2 border-ember bg-ember/[0.07] px-4 py-3.5">
          <Megaphone className="mt-1 h-4 w-4 shrink-0 text-ember" aria-hidden="true" />
          <p className="whitespace-pre-line text-[0.98rem] leading-relaxed text-cream">{info.announcement}</p>
        </div>
      )}

      <h3 data-row className="ui mt-8 text-[0.75rem] uppercase tracking-[0.18em] text-ash">
        The week
      </h3>
      <ol className="mt-3 border-t border-line">
        {info.weekly.map((regular) => {
          const actual = thisWeek.get(regular.day)
          const isToday = actual?.date === info.today
          const special = actual?.special ?? null
          const hours = actual ?? regular
          return (
            <li
              key={regular.day}
              data-row
              aria-current={isToday ? 'date' : undefined}
              className={cn('relative flex items-baseline justify-between gap-4 border-b border-line py-3.5 pl-4 pr-3', isToday && 'bg-char-2')}
            >
              <span className={cn('absolute inset-y-0 left-0 w-[3px] bg-ember transition-opacity', isToday ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
              <div className="min-w-0">
                <p className={cn('flex items-center gap-2.5', isToday ? 'text-cream' : 'text-bone/75')}>
                  <span className={cn(isToday && 'ui')}>{DAY_NAME[regular.day]}</span>
                  {isToday && (
                    <span className="ui rounded-full bg-ember px-2 py-px text-[0.62rem] uppercase tracking-[0.14em] text-ink">Today</span>
                  )}
                </p>
                {special && (
                  <p className="ui mt-1 text-[0.78rem] text-ember">
                    {formatDate(actual!.date, info.today)} · {special.title}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className={cn('ui tabular', hours.closed ? 'text-ash' : isToday ? 'text-cream' : 'text-cream/90')}>
                  {formatRange(hours)}
                  {!hours.closed && hours.overnight && <span className="ml-1 text-[0.7rem] text-ash">+1</span>}
                </p>
                {special && <p className="mt-1 text-[0.78rem] text-ash line-through decoration-ash/50">{formatRange(regular)}</p>}
              </div>
            </li>
          )
        })}
      </ol>

      {upcoming.length > 0 && (
        <>
          <h3 data-row className="ui mt-8 flex items-center gap-2 text-[0.75rem] uppercase tracking-[0.18em] text-ash">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            Holidays &amp; special hours
          </h3>
          <ul className="mt-3 space-y-2">
            {upcoming.map((s) => (
              <li key={s.id} data-row className="flex items-start justify-between gap-4 border border-line bg-ink px-4 py-3.5">
                <div className="min-w-0">
                  <p className="ui text-[0.78rem] uppercase tracking-[0.12em] text-ember">
                    {formatDateRange(s, info.today)}
                    {s.is_active && <span className="ml-2 text-cream/70">· Now</span>}
                  </p>
                  <p className="mt-1 text-cream">{s.title}</p>
                  {s.note && <p className="mt-1 text-[0.92rem] leading-relaxed text-bone/65">{s.note}</p>}
                </div>
                <p className={cn('ui tabular shrink-0 pt-0.5 text-right', s.closed ? 'text-ash' : 'text-cream')}>
                  {s.closed ? (
                    <span className="inline-flex items-center gap-2">
                      <StatusDot tone="closed" />
                      Closed
                    </span>
                  ) : (
                    formatRange(s)
                  )}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}

      <p data-row className="mt-7 text-sm leading-relaxed text-ash">
        All times are Sri Lanka time. The kitchen closes 30 minutes before we do.
      </p>
    </>
  )
}
