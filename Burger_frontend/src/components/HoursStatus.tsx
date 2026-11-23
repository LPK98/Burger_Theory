import { useEffect, useRef, useState } from 'react'
import { cn } from '../lib/utils'
import type { StatusCopy } from '../lib/opening-hours'

const TONE: Record<StatusCopy['tone'], { pill: string; dot: string }> = {
  open: { pill: 'border-ember/45 bg-ember/10 text-ember', dot: 'bg-ember text-ember live-dot' },
  soon: { pill: 'border-ember-hot/45 bg-ember-hot/10 text-ember-hot', dot: 'bg-ember-hot text-ember-hot live-dot' },
  closed: { pill: 'border-cream/15 bg-cream/[0.04] text-cream/75', dot: 'bg-ash/70' },
}

/** `live: false` stops the halo, e.g. inside a closed (hidden but mounted) dialog. */
export function StatusDot({ tone, className, live = true }: { tone: StatusCopy['tone']; className?: string; live?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [inView, setInView] = useState(false)

  // Performance: the halo loops forever. While the dot is off screen (or inside a section that hasn't
  // been revealed yet) Chrome can't hand the loop to the compositor and runs it on the main thread
  // every frame, so it only exists while the dot is in view.
  useEffect(() => {
    const el = ref.current
    if (!el || tone === 'closed') return
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [tone])

  return (
    <span ref={ref} className={cn('inline-block h-2 w-2 shrink-0 rounded-full', TONE[tone].dot, className)} aria-hidden="true">
      {tone !== 'closed' && live && inView && <span className="live-halo" />}
    </span>
  )
}

/** "● OPEN NOW" pill. */
export function StatusBadge({ copy, className, live }: { copy: StatusCopy; className?: string; live?: boolean }) {
  return (
    <span className={cn('ui inline-flex h-7 items-center gap-2 rounded-full border px-3 text-[0.7rem] uppercase tracking-[0.16em]', TONE[copy.tone].pill, className)}>
      <StatusDot tone={copy.tone} live={live} />
      {copy.label}
    </span>
  )
}
