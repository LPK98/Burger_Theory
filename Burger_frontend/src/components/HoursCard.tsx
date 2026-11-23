import { ArrowUpRight, Clock, Megaphone } from 'lucide-react'
import { openHoursDialog, useOpeningHours } from '../hooks/useOpeningHours'
import { groupWeek, statusCopy } from '../lib/opening-hours'
import { cn } from '../lib/utils'
import { StatusBadge } from './HoursStatus'

/**
 * The Hours card in the Visit section: the regular week grouped by matching days, the live
 * status and any announcement. The whole card opens the full schedule (HoursDialog).
 * Same frame, type and spacing as the original static card.
 */
export function HoursCard() {
  const { data, status } = useOpeningHours()
  const copy = data ? statusCopy(data) : null
  const today = data?.week[0]?.day
  const groups = data ? groupWeek(data.weekly).map((g) => ({ ...g, isToday: today !== undefined && g.members.includes(today) })) : null

  return (
    <div data-card className="group relative flex flex-col justify-between gap-8 border border-line bg-ink p-7 transition-colors duration-500 hover:border-ember/45 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex items-center gap-3">
          <Clock className="h-5 w-5 text-ember" aria-hidden="true" />
          <h3 className="display text-[2.4rem] text-cream">
            <button
              type="button"
              onClick={openHoursDialog}
              aria-haspopup="dialog"
              className="text-left uppercase focus-visible:outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:outline-2 focus-visible:after:outline-offset-4 focus-visible:after:outline-ember"
            >
              Hours
              <span className="sr-only">: full schedule, holidays and today’s status</span>
            </button>
          </h3>
        </div>
        {copy && <StatusBadge copy={copy} className="transition-transform duration-500 group-hover:-translate-y-0.5" />}
      </div>

      {groups ? (
        <dl className="space-y-3">
          {groups.map((h) => (
            <div key={h.days} className="flex items-baseline justify-between gap-4 border-b border-line pb-3 last:border-0 last:pb-0">
              <dt className={cn('relative min-w-0', h.isToday ? 'text-cream' : 'text-bone/75')}>
                {h.isToday && <span className="absolute -left-4 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-ember" aria-hidden="true" />}
                <span aria-hidden="true">{h.short}</span>
                <span className="sr-only">
                  {h.days}
                  {h.isToday ? ' (includes today)' : ''}
                </span>
              </dt>
              <dd className={cn('ui tabular shrink-0 whitespace-nowrap text-right', h.time === 'Closed' ? 'text-ash' : 'text-cream')}>{h.time}</dd>
            </div>
          ))}
        </dl>
      ) : status === 'error' ? (
        <p className="text-bone/70">Hours are unavailable right now. Tap for the full schedule.</p>
      ) : (
        <div className="space-y-3" aria-busy="true" aria-label="Loading opening hours">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-baseline justify-between gap-4 border-b border-line pb-3 last:border-0 last:pb-0">
              <span className="h-[1.1rem] w-32 animate-pulse rounded-[2px] bg-cream/[0.06]" />
              <span className="h-[1.1rem] w-24 animate-pulse rounded-[2px] bg-cream/[0.06]" />
            </div>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {data?.announcement && (
          <p className="flex gap-2.5 text-[0.95rem] leading-snug text-cream/85">
            <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-ember" aria-hidden="true" />
            <span className="line-clamp-2">{data.announcement}</span>
          </p>
        )}
        <p className="flex items-center justify-between gap-4 text-sm text-ash">
          <span>{copy ? copy.detail : 'The kitchen closes 30 minutes before we do.'}</span>
          <span className="ui inline-flex shrink-0 items-center gap-1 text-ember" aria-hidden="true">
            Full schedule
            <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </span>
        </p>
      </div>
    </div>
  )
}
