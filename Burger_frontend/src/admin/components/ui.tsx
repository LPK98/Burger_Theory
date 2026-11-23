import { ChevronLeft, ChevronRight, LoaderCircle, Search, TriangleAlert, X } from 'lucide-react'
import { useId, type ComponentProps, type ReactNode } from 'react'
import { cn } from '../../lib/utils'

// ── Buttons ───────────────────────────────────────────────────────────────────

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const variants: Record<Variant, string> = {
  primary: 'bg-ember text-ember-ink hover:bg-ember-hot shadow-[0_8px_24px_-12px_rgb(234_95_23/0.8)]',
  secondary: 'border border-rule-strong bg-smoke/60 text-bone hover:border-bone/30 hover:bg-smoke-2',
  ghost: 'text-grey hover:bg-smoke hover:text-bone',
  danger: 'border border-bad/40 bg-bad/10 text-[#ff8a83] hover:bg-bad/20',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 gap-1.5 px-3 text-[0.9375rem]',
  md: 'h-10 gap-2 px-4 text-sm',
}

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  loading?: boolean
}

export function Button({ variant = 'secondary', size = 'md', icon, loading, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-lg font-semibold transition-[background-color,border-color,color] duration-200 disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  )
}

export function IconButton({ label, className, children, ...rest }: ComponentProps<'button'> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg text-grey transition-colors hover:bg-smoke hover:text-bone disabled:opacity-40', className)}
      {...rest}
    >
      {children}
    </button>
  )
}

// ── Form fields ───────────────────────────────────────────────────────────────

const control =
  'w-full rounded-lg border bg-pitch/70 px-3 text-sm text-bone placeholder:text-dim transition-colors duration-150 focus:border-ember focus:outline-none disabled:opacity-60'

interface FieldShell {
  label: string
  hint?: ReactNode
  error?: string
  optional?: boolean
  className?: string
  /** Visually hide the label (it stays for screen readers). */
  hideLabel?: boolean
}

function FieldFrame({ id, label, hint, error, optional, className, hideLabel, children }: FieldShell & { id: string; children: ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={id} className={cn('mb-1.5 flex items-baseline justify-between gap-3 text-[0.9375rem] font-medium text-bone/85', hideLabel && 'sr-only')}>
        {label}
        {optional && <span className="font-normal text-dim">Optional</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 flex items-start gap-1.5 text-[0.9375rem] text-[#ff8a83]">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-1.5 text-[0.9375rem] text-dim">
            {hint}
          </p>
        )
      )}
    </div>
  )
}

function describedBy(id: string, error?: string, hint?: ReactNode) {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined
}

export function TextField({ label, hint, error, optional, className, hideLabel, prefix, ...rest }: FieldShell & Omit<ComponentProps<'input'>, 'prefix'> & { prefix?: string }) {
  const id = useId()
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} optional={optional} className={className} hideLabel={hideLabel}>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-dim">{prefix}</span>}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, error, hint)}
          className={cn(control, 'h-10', prefix && 'pl-10', error ? 'border-bad/70' : 'border-rule-strong')}
          {...rest}
        />
      </div>
    </FieldFrame>
  )
}

export function TextArea({ label, hint, error, optional, className, hideLabel, ...rest }: FieldShell & ComponentProps<'textarea'>) {
  const id = useId()
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} optional={optional} className={className} hideLabel={hideLabel}>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={cn(control, 'min-h-24 py-2.5 leading-relaxed', error ? 'border-bad/70' : 'border-rule-strong')}
        {...rest}
      />
    </FieldFrame>
  )
}

export function SelectField({ label, hint, error, optional, className, hideLabel, children, ...rest }: FieldShell & ComponentProps<'select'>) {
  const id = useId()
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} optional={optional} className={className} hideLabel={hideLabel}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={cn(control, 'h-10 appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2712%27%20height=%2712%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%23a69f97%27%20stroke-width=%272.5%27%3E%3Cpath%20d=%27m6%209%206%206%206-6%27/%3E%3C/svg%3E")] bg-[right_0.75rem_center] bg-no-repeat pr-9', error ? 'border-bad/70' : 'border-rule-strong')}
        {...rest}
      >
        {children}
      </select>
    </FieldFrame>
  )
}

/** Compact select for filter bars (label is visually hidden). */
export function FilterSelect({ label, className, children, ...rest }: { label: string } & ComponentProps<'select'>) {
  return (
    <SelectField label={label} hideLabel className={className} {...rest}>
      {children}
    </SelectField>
  )
}

/**
 * The bare on/off control. Its accessible name is `label` (screen-reader text inside the
 * button); use it on its own in tables, or through <Switch> with a visible label.
 */
export function ToggleSwitch({ checked, onChange, label, disabled, id, describedBy }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean; id?: string; describedBy?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200 disabled:opacity-50', checked ? 'border-ember bg-ember' : 'border-rule-strong bg-smoke-2')}
    >
      <span className="sr-only">{label}</span>
      <span
        aria-hidden="true"
        className={cn(
          'absolute left-0 top-0.5 h-[1.125rem] w-[1.125rem] rounded-full shadow transition-transform duration-200 ease-[var(--ease-out-expo)]',
          checked ? 'translate-x-[1.3rem] bg-ember-ink' : 'translate-x-0.5 bg-grey',
        )}
      />
    </button>
  )
}

/** A switch with a visible label and optional description. Clicking the label toggles it. */
export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; description?: ReactNode; disabled?: boolean }) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-bone">
          {label}
        </label>
        {description && (
          <p id={`${id}-desc`} className="mt-0.5 text-[0.9375rem] text-dim">
            {description}
          </p>
        )}
      </div>
      <ToggleSwitch id={id} checked={checked} onChange={onChange} label={label} disabled={disabled} describedBy={description ? `${id}-desc` : undefined} />
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder, label, className }: { value: string; onChange: (v: string) => void; placeholder: string; label: string; className?: string }) {
  const id = useId()
  return (
    <div className={cn('relative', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dim" aria-hidden="true" />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(control, 'h-10 border-rule-strong pl-9 pr-8')}
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-dim hover:text-bone">
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

/** Segmented control (a small set of mutually exclusive views). */
export function Segmented<T extends string>({ value, onChange, options, label, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; size?: Size }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-rule-strong bg-pitch/60 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md font-medium transition-colors',
            size === 'sm' ? 'h-7 px-2.5 text-[0.9375rem]' : 'h-8 px-3 text-sm',
            value === o.value ? 'bg-smoke-2 text-bone shadow-[inset_0_0_0_1px_rgb(255_240_228/0.1)]' : 'text-grey hover:text-bone',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ── Surfaces & feedback ───────────────────────────────────────────────────────

export function Card({ className, children, ...rest }: ComponentProps<'section'>) {
  return (
    <section className={cn('glass min-w-0 rounded-2xl', className)} {...rest}>
      {children}
    </section>
  )
}

export function CardHeader({ title, description, action, id }: { title: ReactNode; description?: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
      <div className="min-w-0">
        <h2 id={id} className="text-[1.0625rem] font-semibold text-bone">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-[0.9375rem] text-dim">{description}</p>}
      </div>
      {action}
    </header>
  )
}

export type Tone = 'neutral' | 'good' | 'warn' | 'serious' | 'bad' | 'info' | 'ember'

const tones: Record<Tone, string> = {
  neutral: 'bg-bone/8 text-grey ring-bone/10',
  good: 'bg-good/12 text-[#6fd981] ring-good/25',
  warn: 'bg-warn/12 text-warn ring-warn/25',
  serious: 'bg-serious/12 text-serious ring-serious/25',
  bad: 'bg-bad/12 text-[#ff8a83] ring-bad/25',
  info: 'bg-info/12 text-[#93bdf5] ring-info/25',
  ember: 'bg-ember/14 text-ember-hot ring-ember/30',
}

const dots: Record<Tone, string> = {
  neutral: 'bg-grey',
  good: 'bg-good',
  warn: 'bg-warn',
  serious: 'bg-serious',
  bad: 'bg-bad',
  info: 'bg-info',
  ember: 'bg-ember',
}

/** A status pill: always a dot and a word, never colour alone. */
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', tones[tone], className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', dots[tone])} aria-hidden="true" />
      {children}
    </span>
  )
}

export function Spinner({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-sm text-grey', className)}>
      <LoaderCircle className="h-4 w-4 animate-spin text-ember" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-bone/6', className)} aria-hidden="true" />
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-ember/10 text-ember">{icon}</div>}
      <p className="text-[1.0625rem] font-semibold text-bone">{title}</p>
      {children && <p className="mt-1 max-w-[42ch] text-sm text-grey">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <TriangleAlert className="h-6 w-6 text-bad" aria-hidden="true" />
      <p className="max-w-[48ch] text-sm text-grey">{message}</p>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function Notice({ tone = 'warn', children, action }: { tone?: 'warn' | 'info' | 'bad'; children: ReactNode; action?: ReactNode }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3 text-sm',
        tone === 'warn' && 'border-warn/30 bg-warn/8 text-[#ffd98a]',
        tone === 'info' && 'border-info/30 bg-info/8 text-[#b5d1f7]',
        tone === 'bad' && 'border-bad/30 bg-bad/8 text-[#ffb1ab]',
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  )
}

export function Pagination({ page, lastPage, total, from, to, onPage, noun = 'results' }: { page: number; lastPage: number; total: number; from: number | null; to: number | null; onPage: (p: number) => void; noun?: string }) {
  if (total === 0) return null
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-5 py-3 text-[0.9375rem] text-grey">
      <p className="tabular">
        {from}–{to} of {total.toLocaleString('en-LK')} {noun}
      </p>
      <div className="flex items-center gap-1">
        <IconButton label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </IconButton>
        <span className="tabular px-2">
          Page {page} of {lastPage}
        </span>
        <IconButton label="Next page" disabled={page >= lastPage} onClick={() => onPage(page + 1)}>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </IconButton>
      </div>
    </nav>
  )
}

/** Table shell with horizontal scroll on small screens. */
export function Table({ children, label, className }: { children: ReactNode; label: string; className?: string }) {
  return (
    <div className={cn('scrollbar-thin relative overflow-x-auto', className)}>
      <table className="w-full min-w-[44rem] border-collapse text-left text-sm" aria-label={label}>
        {children}
      </table>
    </div>
  )
}

export const th = 'whitespace-nowrap border-b border-rule px-4 py-3 text-xs font-medium text-dim first:pl-5 last:pr-5'
export const td = 'border-b border-rule/70 px-4 py-3 align-middle first:pl-5 last:pr-5'
