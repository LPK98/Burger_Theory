import { cn } from '../lib/utils'
import type { StatusCopy } from '../lib/opening-hours'

const TONE: Record<StatusCopy['tone'], { pill: string; dot: string }> = {
  open: { pill: 'border-ember/45 bg-ember/10 text-ember', dot: 'bg-ember text-ember live-dot' },
  soon: { pill: 'border-ember-hot/45 bg-ember-hot/10 text-ember-hot', dot: 'bg-ember-hot text-ember-hot live-dot' },
  closed: { pill: 'border-cream/15 bg-cream/[0.04] text-cream/75', dot: 'bg-ash/70' },
}

export function StatusDot({ tone, className }: { tone: StatusCopy['tone']; className?: string }) {
  return <span className={cn('inline-block h-2 w-2 shrink-0 rounded-full', TONE[tone].dot, className)} aria-hidden="true" />
}

/** "● OPEN NOW" pill. */
export function StatusBadge({ copy, className }: { copy: StatusCopy; className?: string }) {
  return (
    <span className={cn('ui inline-flex h-7 items-center gap-2 rounded-full border px-3 text-[0.7rem] uppercase tracking-[0.16em]', TONE[copy.tone].pill, className)}>
      <StatusDot tone={copy.tone} />
      {copy.label}
    </span>
  )
}
