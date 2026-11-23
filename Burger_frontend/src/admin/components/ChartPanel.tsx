import { ChartColumn, Table2 } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { Card, ErrorState, Skeleton } from './ui'

/**
 * A chart card with a chart/table switch, so every value can be read without hovering.
 */
export function ChartPanel({
  title,
  description,
  figure,
  table,
  chart,
  loading,
  error,
  onRetry,
  className,
  headerExtra,
}: {
  title: string
  description?: ReactNode
  /** The headline number for this chart (e.g. the period total). */
  figure?: ReactNode
  chart: ReactNode
  table: ReactNode
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  className?: string
  headerExtra?: ReactNode
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const titleId = useId()
  return (
    <Card className={cn('flex flex-col', className)} aria-labelledby={titleId}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <h2 id={titleId} className="text-[0.9375rem] font-semibold text-bone">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-[0.8125rem] text-dim">{description}</p>}
          {figure && <div className="mt-3">{figure}</div>}
        </div>
        <div className="flex items-center gap-2">
          {headerExtra}
          <button
            type="button"
            onClick={() => setView((v) => (v === 'chart' ? 'table' : 'chart'))}
            aria-pressed={view === 'table'}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rule-strong px-2.5 text-[0.8125rem] text-grey hover:text-bone"
          >
            {view === 'chart' ? <Table2 className="h-3.5 w-3.5" aria-hidden="true" /> : <ChartColumn className="h-3.5 w-3.5" aria-hidden="true" />}
            {view === 'chart' ? 'Table' : 'Chart'}
          </button>
        </div>
      </header>
      <div className="flex-1 px-3 pb-4 pt-4 sm:px-4">
        {error ? <ErrorState message={error} onRetry={onRetry} /> : loading ? <Skeleton className="mx-2 h-[240px]" /> : view === 'chart' ? chart : <div className="px-1">{table}</div>}
      </div>
    </Card>
  )
}
