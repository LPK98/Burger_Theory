import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from '../../lib/utils'

/**
 * Hand-built SVG charts following the data-viz rules this portal uses:
 * one hue per series (the validated deep orange on the char surface), 2px lines with a 10%
 * area wash, columns ≤24px with a 4px rounded data end and square baseline, hairline solid
 * gridlines, a crosshair (line) or per-mark (columns) tooltip that also works from the
 * keyboard, and a table view so no value is reachable only by hovering.
 */

const SERIES = 'var(--color-ember)'
const SURFACE = '#1a1715'
const GRID = 'rgb(255 240 228 / 0.07)'
const AXIS = 'rgb(255 240 228 / 0.16)'

export interface Point {
  key: string
  /** Short axis label. */
  label: string
  /** Full label for the tooltip and table. */
  longLabel: string
  value: number
  /** Extra tooltip lines (text tokens only). */
  extra?: { label: string; value: string }[]
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    ro.observe(node)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/** Rounds the axis maximum up to 1, 2, 2.5 or 5 × 10ⁿ and returns evenly spaced ticks. */
function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1]
  const raw = max / count
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw
  const ticks: number[] = []
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v)
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step)
  return ticks
}

/** Every nth label so they never collide. */
function labelEvery(n: number, width: number, minGap = 76) {
  const fit = Math.max(1, Math.floor(width / minGap))
  return Math.max(1, Math.ceil(n / fit))
}

interface ChartBase {
  points: Point[]
  height?: number
  formatValue: (v: number) => string
  formatAxis: (v: number) => string
  /** Accessible name, e.g. "Revenue per day, last 30 days". */
  label: string
  /** Name of the measure in the tooltip and table, e.g. "Revenue". */
  valueName: string
  /** Lower the opacity while a refetch is in flight (keeps the frame). */
  stale?: boolean
}

const PAD = { top: 16, right: 16, bottom: 28, left: 56 }

function Tooltip({ x, y, width, point, valueName, formatValue }: { x: number; y: number; width: number; point: Point; valueName: string; formatValue: (v: number) => string }) {
  const left = Math.min(Math.max(x, 90), width - 90)
  return (
    <div
      className="pointer-events-none absolute z-10 min-w-[10rem] -translate-x-1/2 -translate-y-full rounded-lg border border-rule-strong bg-[#221e1b]/95 px-3 py-2 shadow-[0_16px_40px_-16px_rgb(0_0_0/0.9)] backdrop-blur"
      style={{ left, top: Math.max(y - 12, 8) }}
    >
      <p className="text-xs text-grey">{point.longLabel}</p>
      <p className="mt-1 flex items-center gap-2 text-sm">
        <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: SERIES }} aria-hidden="true" />
        <span className="font-semibold text-bone">{formatValue(point.value)}</span>
        <span className="text-grey">{valueName}</span>
      </p>
      {point.extra?.map((e) => (
        <p key={e.label} className="mt-0.5 flex justify-between gap-4 text-xs text-grey">
          <span>{e.label}</span>
          <span className="tabular text-bone/90">{e.value}</span>
        </p>
      ))}
    </div>
  )
}

/**
 * Keyboard and screen-reader access: a visually hidden native range input steps through
 * the points (arrow keys, Home, End). Each step moves the crosshair and announces
 * "period: value". The wrapper shows the focus ring.
 */
function ValueReader({ points, active, setActive, label, valueName, formatValue }: { points: Point[]; active: number | null; setActive: (i: number | null) => void; label: string; valueName: string; formatValue: (v: number) => string }) {
  const last = points.length - 1
  if (last < 0) return null
  const i = active ?? last
  return (
    <input
      type="range"
      min={0}
      max={last}
      step={1}
      value={i}
      aria-label={`${label}. Read values with the arrow keys`}
      aria-valuetext={`${points[i].longLabel}: ${formatValue(points[i].value)} ${valueName.toLowerCase()}`}
      onFocus={() => setActive(i)}
      onBlur={() => setActive(null)}
      onChange={(e) => setActive(Number(e.target.value))}
      className="sr-only"
    />
  )
}

const FOCUS_RING = 'rounded-md has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-4 has-[input:focus-visible]:outline-ember'

/** Line with a 10% area wash and a snapping crosshair. Best for change over time. */
export function AreaChart({ points, height = 260, formatValue, formatAxis, label, valueName, stale }: ChartBase) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const gradientId = useId()

  const geometry = useMemo(() => {
    const max = Math.max(0, ...points.map((p) => p.value))
    const ticks = niceTicks(max)
    const top = ticks[ticks.length - 1] || 1
    const innerW = Math.max(0, width - PAD.left - PAD.right)
    const innerH = height - PAD.top - PAD.bottom
    const x = (i: number) => PAD.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
    const y = (v: number) => PAD.top + innerH - (v / top) * innerH
    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('')
    const area = points.length ? `${line}L${x(points.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z` : ''
    return { ticks, x, y, line, area, innerW }
  }, [points, width, height])

  const every = labelEvery(points.length, geometry.innerW)
  const onPointer = (clientX: number, rect: DOMRect) => {
    if (points.length === 0) return
    const rel = clientX - rect.left - PAD.left
    const i = Math.round((rel / Math.max(1, geometry.innerW)) * (points.length - 1))
    setActive(Math.min(points.length - 1, Math.max(0, i)))
  }
  const last = points.length - 1
  const current = active !== null ? points[active] : null

  return (
    <div
      ref={ref}
      className={cn('relative transition-opacity', FOCUS_RING, stale && 'opacity-50')}
      onPointerMove={(e) => onPointer(e.clientX, e.currentTarget.getBoundingClientRect())}
      onPointerLeave={() => setActive(null)}
    >
      <ValueReader points={points} active={active} setActive={setActive} label={label} valueName={valueName} formatValue={formatValue} />
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label} className="block touch-pan-y">
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#ea5f17" stopOpacity="0.16" />
              <stop offset="1" stopColor="#ea5f17" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {geometry.ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={geometry.y(t)} y2={geometry.y(t)} stroke={t === 0 ? AXIS : GRID} />
              <text x={PAD.left - 10} y={geometry.y(t)} dy="0.32em" textAnchor="end" className="fill-dim text-[13px] tabular">
                {formatAxis(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            // The last label is right-aligned, so the one before it needs a full step of room.
            (i % every === 0 && last - i >= every) || i === last ? (
              <text key={p.key} x={geometry.x(i)} y={height - 8} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'} className="fill-dim text-[13px]">
                {p.label}
              </text>
            ) : null,
          )}
          <path d={geometry.area} fill={`url(#${gradientId})`} />
          <path d={geometry.line} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {last >= 0 && active === null && <circle cx={geometry.x(last)} cy={geometry.y(points[last].value)} r={4} fill={SERIES} stroke={SURFACE} strokeWidth={2} />}
          {current && active !== null && (
            <g aria-hidden="true">
              <line x1={geometry.x(active)} x2={geometry.x(active)} y1={PAD.top} y2={height - PAD.bottom} stroke="rgb(255 240 228 / 0.28)" />
              <circle cx={geometry.x(active)} cy={geometry.y(current.value)} r={4.5} fill={SERIES} stroke={SURFACE} strokeWidth={2} />
            </g>
          )}
        </svg>
      )}
      {current && active !== null && <Tooltip x={geometry.x(active)} y={geometry.y(current.value)} width={width} point={current} valueName={valueName} formatValue={formatValue} />}
    </div>
  )
}

/** Vertical columns with a per-column tooltip. Best for counts per period. */
export function ColumnChart({ points, height = 240, formatValue, formatAxis, label, valueName, stale }: ChartBase) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)

  const max = Math.max(0, ...points.map((p) => p.value))
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1] || 1
  const innerW = Math.max(0, width - PAD.left - PAD.right)
  const innerH = height - PAD.top - PAD.bottom
  const band = points.length ? innerW / points.length : 0
  const barW = Math.max(2, Math.min(24, band - 2))
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH
  const every = labelEvery(points.length, innerW, 64)
  const current = active !== null ? points[active] : null
  const cx = (i: number) => PAD.left + band * i + band / 2

  return (
    <div ref={ref} className={cn('relative transition-opacity', FOCUS_RING, stale && 'opacity-50')} onPointerLeave={() => setActive(null)}>
      <ValueReader points={points} active={active} setActive={setActive} label={label} valueName={valueName} formatValue={formatValue} />
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label} className="block touch-pan-y">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? AXIS : GRID} />
              <text x={PAD.left - 10} y={y(t)} dy="0.32em" textAnchor="end" className="fill-dim text-[13px] tabular">
                {formatAxis(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) => {
            const h = Math.max(0, y(0) - y(p.value))
            const x = cx(i) - barW / 2
            const r = Math.min(4, barW / 2, h)
            return (
              <g key={p.key} onPointerEnter={() => setActive(i)}>
                {/* Hit area: the whole band, taller than the mark. */}
                <rect x={PAD.left + band * i} y={PAD.top} width={band} height={innerH} fill="transparent" />
                {h > 0 && (
                  <path
                    d={`M${x},${y(0)}V${y(p.value) + r}Q${x},${y(p.value)} ${x + r},${y(p.value)}H${x + barW - r}Q${x + barW},${y(p.value)} ${x + barW},${y(p.value) + r}V${y(0)}Z`}
                    fill={SERIES}
                    opacity={active === null || active === i ? 1 : 0.45}
                  />
                )}
                {((i % every === 0 && points.length - 1 - i >= every / 2) || i === points.length - 1) && (
                  <text x={cx(i)} y={height - 8} textAnchor="middle" className="fill-dim text-[13px]">
                    {p.label}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      )}
      {current && active !== null && <Tooltip x={cx(active)} y={y(current.value)} width={width} point={current} valueName={valueName} formatValue={formatValue} />}
    </div>
  )
}

/** Ranked horizontal bars with the value at the tip. Best for comparing categories. */
export function BarList({ rows, formatValue, label, emptyText = 'Nothing to show yet.' }: { rows: { key: string; label: ReactNode; value: number; sub?: string }[]; formatValue: (v: number) => string; label: string; emptyText?: string }) {
  const max = Math.max(0, ...rows.map((r) => r.value))
  if (rows.length === 0) return <p className="px-1 py-6 text-sm text-dim">{emptyText}</p>
  return (
    <ul aria-label={label} className="space-y-3.5">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-bone/90">{r.label}</span>
            <span className="shrink-0 tabular text-bone">
              {formatValue(r.value)}
              {r.sub && <span className="ml-2 text-xs text-dim">{r.sub}</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-bone/[0.06]" aria-hidden="true">
            <div className="h-2 rounded-full" style={{ width: `${max && r.value > 0 ? Math.max(1.5, (r.value / max) * 100) : 0}%`, background: SERIES }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Accessible table version of a series, toggled from the chart card. */
export function SeriesTable({ points, valueName, formatValue, caption }: { points: Point[]; valueName: string; formatValue: (v: number) => string; caption: string }) {
  return (
    <div className="scrollbar-thin max-h-72 overflow-y-auto rounded-lg border border-rule">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-char">
          <tr>
            <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-dim">
              Period
            </th>
            <th scope="col" className="px-3 py-2 text-right text-xs font-medium text-dim">
              {valueName}
            </th>
            {points[0]?.extra?.map((e) => (
              <th key={e.label} scope="col" className="px-3 py-2 text-right text-xs font-medium text-dim">
                {e.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.key} className="border-t border-rule/70">
              <th scope="row" className="px-3 py-1.5 text-left font-normal text-grey">
                {p.longLabel}
              </th>
              <td className="tabular px-3 py-1.5 text-right text-bone">{formatValue(p.value)}</td>
              {p.extra?.map((e) => (
                <td key={e.label} className="tabular px-3 py-1.5 text-right text-grey">
                  {e.value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
