import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, CopyCheck, Megaphone, Pencil, Trash } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { DAY_NAME, formatDateRange, formatRange, statusCopy } from '../../lib/opening-hours'
import { cn } from '../../lib/utils'
import { Modal } from '../components/overlay'
import { useConfirm, useToast } from '../components/overlay-context'
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Notice, Segmented, Skeleton, Switch, TextArea, TextField, type Tone } from '../components/ui'
import { PageHeader } from '../layout'
import { ApiError, errorMessage } from '../lib/api'
import { openingHours as api } from '../lib/endpoints'
import type { OpeningHours, OpeningHoursAdmin, SpecialDate, SpecialDateInput } from '../lib/types'

const KEY = ['opening-hours']

export default function OpeningHoursPage() {
  // No refetch on focus: the form holds unsaved edits.
  const query = useQuery({ queryKey: KEY, queryFn: api.get, refetchOnWindowFocus: false })
  return (
    <>
      <PageHeader
        title="Opening hours"
        description="The weekly hours, holidays and special days customers see on the website, which works out “Open now” from them. Times are Sri Lanka time."
      />
      {query.isError ? (
        <Card>
          <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
        </Card>
      ) : !query.data ? (
        <div className="space-y-3">
          <Skeleton className="h-80" />
          <Skeleton className="h-56" />
        </div>
      ) : (
        <>
          {/* Remount when the stored hours change (after a save), but not when only special dates change. */}
          <HoursForm key={JSON.stringify(toForm(query.data))} hours={query.data} />
          <SpecialDates hours={query.data} />
        </>
      )}
    </>
  )
}

// ── Live status ───────────────────────────────────────────────────────────────

const STATUS_TONE: Record<'open' | 'soon' | 'closed', Tone> = { open: 'good', soon: 'warn', closed: 'bad' }

function LiveStatus({ hours }: { hours: OpeningHoursAdmin }) {
  const copy = statusCopy(hours)
  return (
    <Card aria-labelledby="h-now">
      <CardHeader id="h-now" title="Right now" description="What the website shows at this moment (saved settings)." />
      <div className="p-5">
        <Badge tone={hours.status.state === 'temporarily_closed' ? 'serious' : STATUS_TONE[copy.tone]} className="text-[0.8125rem]">
          {copy.label}
        </Badge>
        <p className="title mt-3 text-[1.75rem] leading-tight text-bone">{copy.detail}</p>
        {hours.status.reason && (
          <p className="mt-1.5 text-sm text-grey">
            Because of <span className="text-bone">{hours.status.reason.title}</span>
          </p>
        )}
      </div>
    </Card>
  )
}

// ── Weekly hours, closure switch and announcement ─────────────────────────────

interface FormState {
  weekly: OpeningHours[]
  temporarily_closed: boolean
  announcement: string
}

function toForm(h: OpeningHoursAdmin): FormState {
  return {
    weekly: h.weekly.map(({ day, closed, open, close }) => ({ day, closed, open: open ?? '11:00', close: close ?? '22:00' })),
    temporarily_closed: h.temporarily_closed,
    announcement: h.announcement ?? '',
  }
}

function HoursForm({ hours }: { hours: OpeningHoursAdmin }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const initial = toForm(hours)
  const [form, setForm] = useState<FormState>(initial)
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)

  const setDay = (i: number, changes: Partial<OpeningHours>) => {
    setForm((f) => ({ ...f, weekly: f.weekly.map((h, j) => (j === i ? { ...h, ...changes } : h)) }))
    setErrors((e) => ({ ...e, [`weekly.${i}.open`]: undefined, [`weekly.${i}.close`]: undefined }))
  }
  const copyMonday = () => {
    const [mon] = form.weekly
    setForm((f) => ({ ...f, weekly: f.weekly.map((h) => ({ ...h, closed: mon.closed, open: mon.open, close: mon.close })) }))
    setErrors({})
  }

  const save = useMutation({
    mutationFn: api.update,
    onSuccess: (res) => {
      queryClient.setQueryData(KEY, res)
      toast.success('Opening hours saved. The website shows them within a minute.')
    },
    onError: (e) => {
      const err = ApiError.from(e)
      if (err.code !== 'validation_failed') return toast.error(err.message)
      setErrors(Object.fromEntries(Object.keys(err.fieldErrors).map((k) => [k, err.field(k)])))
      toast.error('Check the highlighted fields.')
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const found: Record<string, string> = {}
    form.weekly.forEach((h, i) => {
      if (!h.closed && (!h.open || !h.close)) found[`weekly.${i}.open`] = 'Set opening and closing times.'
      else if (!h.closed && h.open === h.close) found[`weekly.${i}.close`] = 'Closing time must differ from opening time.'
    })
    if (form.announcement.length > 500) found.announcement = 'Keep it under 500 characters.'
    setErrors(found)
    if (Object.keys(found).length) return toast.error('Check the highlighted fields.')

    save.mutate({
      weekly: form.weekly.map((h) => (h.closed ? { day: h.day, closed: true, open: null, close: null } : h)),
      temporarily_closed: form.temporarily_closed,
      announcement: form.announcement.trim() || null,
    })
  }

  return (
    <form noValidate onSubmit={submit} className="space-y-4">
      {hours.temporarily_closed && <Notice tone="bad">The website shows the restaurant as temporarily closed, whatever the hours below say.</Notice>}

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Card aria-labelledby="h-week">
          <CardHeader
            id="h-week"
            title="Weekly hours"
            description="A closing time earlier than the opening time means after midnight. 23:59 means until midnight."
            action={
              <Button size="sm" variant="ghost" icon={<CopyCheck className="h-4 w-4" aria-hidden="true" />} onClick={copyMonday}>
                Use Monday for every day
              </Button>
            }
          />
          <ul className="divide-y divide-rule/70 px-5 pb-3 pt-2">
            {form.weekly.map((h, i) => {
              const overnight = !h.closed && !!h.open && !!h.close && h.close < h.open && h.close !== '00:00'
              const error = errors[`weekly.${i}.open`] ?? errors[`weekly.${i}.close`]
              return (
                <li key={h.day} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <span className="w-28 text-sm font-medium text-bone">{DAY_NAME[h.day]}</span>
                  <label className="flex items-center gap-2 text-sm text-grey">
                    <input type="checkbox" className="h-4 w-4 accent-[#ea5f17]" checked={!h.closed} onChange={(e) => setDay(i, { closed: !e.target.checked })} />
                    Open<span className="sr-only"> on {DAY_NAME[h.day]}</span>
                  </label>
                  {h.closed ? (
                    <span className="text-sm text-dim">Closed all day</span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <TextField label={`${DAY_NAME[h.day]} opens`} hideLabel type="time" value={h.open ?? ''} onChange={(e) => setDay(i, { open: e.target.value })} className="w-32" />
                      <span className="text-sm text-dim">to</span>
                      <TextField label={`${DAY_NAME[h.day]} closes`} hideLabel type="time" value={h.close ?? ''} onChange={(e) => setDay(i, { close: e.target.value })} className="w-32" />
                      {overnight && <Badge tone="info">Closes next day</Badge>}
                    </div>
                  )}
                  {error && <p className="w-full text-[0.8125rem] text-[#ff8a83]">{error}</p>}
                </li>
              )
            })}
          </ul>
        </Card>

        <div className="space-y-4">
          <LiveStatus hours={hours} />
          <Card aria-labelledby="h-notice">
            <CardHeader id="h-notice" title="Closures and notices" />
            <div className="space-y-5 p-5">
              <Switch
                checked={form.temporarily_closed}
                onChange={(v) => setForm((f) => ({ ...f, temporarily_closed: v }))}
                label="Temporarily closed"
                description="Shows “Temporarily closed” straight away, e.g. for a power cut. Switch it off to go back to the hours. For planned closures, add a special date instead."
              />
              <TextArea
                label="Announcement"
                optional
                value={form.announcement}
                maxLength={500}
                rows={4}
                onChange={(e) => {
                  setForm((f) => ({ ...f, announcement: e.target.value }))
                  setErrors((er) => ({ ...er, announcement: undefined }))
                }}
                error={errors.announcement}
                hint={`Shown with the hours on the website. ${500 - form.announcement.length} characters left.`}
                placeholder="We’re closed on Poya days. Happy holidays from the Burger Theory crew!"
              />
            </div>
          </Card>
        </div>
      </div>

      <div className={cn('fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-pitch/90 backdrop-blur-xl transition-[transform,visibility] duration-300 lg:left-64', dirty ? 'visible translate-y-0' : 'invisible translate-y-full')} aria-hidden={!dirty}>
        <div className="mx-auto flex max-w-[90rem] items-center justify-end gap-3 px-4 py-3 sm:px-6 lg:px-10">
          <p className="mr-auto text-sm text-grey">You have unsaved changes.</p>
          <Button
            tabIndex={dirty ? 0 : -1}
            onClick={() => {
              setForm(initial)
              setErrors({})
            }}
          >
            Discard
          </Button>
          <Button tabIndex={dirty ? 0 : -1} type="submit" variant="primary" loading={save.isPending}>
            Save hours
          </Button>
        </div>
      </div>
    </form>
  )
}

// ── Special dates ─────────────────────────────────────────────────────────────

function SpecialDates({ hours }: { hours: OpeningHoursAdmin }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<SpecialDate | 'new' | null>(null)
  const upcoming = hours.special_dates.filter((s) => !s.is_past)
  const past = hours.special_dates.filter((s) => s.is_past)

  const remove = useMutation({
    mutationFn: (s: SpecialDate) => api.removeSpecial(s.id),
    onSuccess: (_, s) => {
      void queryClient.invalidateQueries({ queryKey: KEY })
      toast.success(`Removed ${s.title}.`)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const row = (s: SpecialDate) => (
    <li key={s.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3.5">
      <div className="w-full shrink-0 sm:w-40">
        <p className="text-sm font-medium text-bone">{formatDateRange(s, hours.today)}</p>
        {s.is_active && <p className="mt-0.5 text-xs text-ember-hot">In effect today</p>}
      </div>
      <div className="min-w-0 flex-1 basis-40">
        <p className="text-sm text-bone">{s.title}</p>
        {s.note && <p className="mt-0.5 truncate text-[0.8125rem] text-dim">{s.note}</p>}
      </div>
      {s.closed ? <Badge tone="bad">Closed</Badge> : <Badge tone="ember">{formatRange(s)}</Badge>}
      {!s.is_past && (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" aria-hidden="true" />} onClick={() => setEditing(s)} aria-label={`Edit ${s.title}`}>
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash className="h-3.5 w-3.5" aria-hidden="true" />}
            aria-label={`Remove ${s.title}`}
            onClick={async () => {
              if (await confirm({ title: `Remove ${s.title}?`, body: 'The regular weekly hours apply on those days again.', confirmLabel: 'Remove', tone: 'danger' })) remove.mutate(s)
            }}
          >
            Remove
          </Button>
        </div>
      )}
    </li>
  )

  return (
    <Card aria-labelledby="h-special" className="mt-4 mb-24">
      <CardHeader
        id="h-special"
        title="Holidays and special hours"
        description="Each entry replaces the weekly hours on its dates: closed (holidays, renovations) or open at different times."
        action={
          <Button size="sm" variant="primary" icon={<CalendarPlus className="h-4 w-4" aria-hidden="true" />} onClick={() => setEditing('new')}>
            Add date
          </Button>
        }
      />
      {upcoming.length === 0 ? (
        <EmptyState icon={<Megaphone className="h-5 w-5" aria-hidden="true" />} title="No special dates coming up">
          Add Poya days, public holidays or a day with shorter hours. Customers see them in the hours panel.
        </EmptyState>
      ) : (
        <ul className="mt-3 divide-y divide-rule/70 border-t border-rule/70">{upcoming.map(row)}</ul>
      )}
      {past.length > 0 && (
        <details className="group border-t border-rule/70">
          <summary className="cursor-pointer list-none px-5 py-3 text-[0.8125rem] text-dim hover:text-grey">
            <span className="group-open:hidden">Show</span>
            <span className="hidden group-open:inline">Hide</span> {past.length} past {past.length === 1 ? 'entry' : 'entries'}
          </summary>
          <ul className="divide-y divide-rule/70 opacity-70">{past.map(row)}</ul>
        </details>
      )}
      <SpecialDateModal special={editing} today={hours.today} onClose={() => setEditing(null)} />
    </Card>
  )
}

function SpecialDateModal({ special, today, onClose }: { special: SpecialDate | 'new' | null; today: string; onClose: () => void }) {
  return special === null ? null : <SpecialDateForm key={special === 'new' ? 'new' : special.id} special={special} today={today} onClose={onClose} />
}

function SpecialDateForm({ special, today, onClose }: { special: SpecialDate | 'new'; today: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const existing = special === 'new' ? null : special
  const [form, setForm] = useState({
    starts_on: existing?.starts_on ?? '',
    ends_on: existing?.ends_on ?? '',
    kind: (existing && !existing.closed ? 'special' : 'closed') as 'closed' | 'special',
    open: existing?.open ?? '11:00',
    close: existing?.close ?? '18:00',
    title: existing?.title ?? '',
    note: existing?.note ?? '',
  })
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const update = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => ({ ...e, [k]: undefined }))
  }

  const save = useMutation({
    mutationFn: (input: SpecialDateInput) => (existing ? api.updateSpecial(existing.id, input) : api.createSpecial(input)),
    onSuccess: (s) => {
      void queryClient.invalidateQueries({ queryKey: KEY })
      toast.success(existing ? `Saved ${s.title}.` : `Added ${s.title}.`)
      onClose()
    },
    onError: (e) => {
      const err = ApiError.from(e)
      if (err.code !== 'validation_failed') return toast.error(err.message)
      setErrors(Object.fromEntries(Object.keys(err.fieldErrors).map((k) => [k, err.field(k)])))
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const found: Record<string, string> = {}
    const ends = form.ends_on || form.starts_on
    if (!form.starts_on) found.starts_on = 'Pick the first day.'
    else if (ends < form.starts_on) found.ends_on = 'The last day can’t be before the first.'
    else if (ends < today) found.ends_on = 'Those dates are already in the past.'
    if (form.title.trim().length < 2) found.title = 'Give it a name customers will see, e.g. “Christmas Day”.'
    if (form.kind === 'special') {
      if (!form.open || !form.close) found.open = 'Set opening and closing times.'
      else if (form.open === form.close) found.close = 'Closing time must differ from opening time.'
    }
    setErrors(found)
    if (Object.keys(found).length) return

    save.mutate({
      starts_on: form.starts_on,
      ends_on: ends,
      closed: form.kind === 'closed',
      ...(form.kind === 'special' ? { open: form.open, close: form.close } : {}),
      title: form.title.trim(),
      note: form.note.trim() || null,
    })
  }

  const overnight = form.kind === 'special' && form.close < form.open && form.close !== '00:00'

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={existing ? `Edit ${existing.title}` : 'Add a holiday or special day'}
      description="Dates are Sri Lanka calendar days. For one day, leave the last day blank."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="special-form" loading={save.isPending}>
            {existing ? 'Save' : 'Add date'}
          </Button>
        </>
      }
    >
      <form id="special-form" noValidate onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="First day" type="date" min={existing ? undefined : today} value={form.starts_on} onChange={(e) => update('starts_on', e.target.value)} error={errors.starts_on} />
          <TextField label="Last day" optional type="date" min={form.starts_on || today} value={form.ends_on} onChange={(e) => update('ends_on', e.target.value)} error={errors.ends_on} />
        </div>
        <div>
          <p className="mb-1.5 text-[0.8125rem] font-medium text-bone/85">On these days</p>
          <Segmented
            label="On these days"
            value={form.kind}
            onChange={(v) => update('kind', v)}
            options={[
              { value: 'closed', label: 'Closed' },
              { value: 'special', label: 'Special hours' },
            ]}
          />
        </div>
        {form.kind === 'special' && (
          <div className="flex flex-wrap items-end gap-3">
            <TextField label="Opens" type="time" value={form.open} onChange={(e) => update('open', e.target.value)} error={errors.open} className="w-36" />
            <TextField label="Closes" type="time" value={form.close} onChange={(e) => update('close', e.target.value)} error={errors.close} className="w-36" />
            {overnight && <Badge tone="info" className="mb-2.5">Closes next day</Badge>}
          </div>
        )}
        <TextField label="Name" value={form.title} maxLength={80} onChange={(e) => update('title', e.target.value)} error={errors.title} placeholder="Christmas Day" />
        <TextField label="Message for customers" optional value={form.note} maxLength={255} onChange={(e) => update('note', e.target.value)} error={errors.note} placeholder="Back on the grill on the 26th." />
      </form>
    </Modal>
  )
}
