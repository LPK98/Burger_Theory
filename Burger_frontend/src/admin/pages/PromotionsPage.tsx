import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, TicketPercent, Trash } from 'lucide-react'
import { useCallback, useState, type FormEvent } from 'react'
import { cn } from '../../lib/utils'
import { Modal } from '../components/overlay'
import { useConfirm, useToast } from '../components/overlay-context'
import { Badge, Button, Card, EmptyState, ErrorState, FilterSelect, IconButton, Pagination, SearchInput, Segmented, Skeleton, Switch, Table, TextField, ToggleSwitch, td, th, type Tone } from '../components/ui'
import { PageHeader } from '../layout'
import { ApiError, errorMessage } from '../lib/api'
import { coupons } from '../lib/endpoints'
import { centsToDollars, count, date, money, dollarsToCents, TIMEZONE } from '../lib/format'
import { useSearchBox, useUrlFilters } from '../lib/hooks'
import type { Coupon, CouponInput } from '../lib/types'

const FILTERS = ['search', 'active'] as const

/** Where a code stands right now, from its switch, dates and usage. */
function couponState(c: Coupon, now = Date.now()): { label: string; tone: Tone } {
  if (!c.is_active) return { label: 'Off', tone: 'neutral' }
  if (c.expires_at && Date.parse(c.expires_at) <= now) return { label: 'Expired', tone: 'bad' }
  if (c.usage_limit !== null && c.times_used >= c.usage_limit) return { label: 'Used up', tone: 'warn' }
  if (c.starts_at && Date.parse(c.starts_at) > now) return { label: 'Scheduled', tone: 'info' }
  return { label: 'Live', tone: 'good' }
}

function describeDiscount(c: Coupon) {
  if (c.discount_type === 'percentage') return `${c.percentage}% off${c.max_discount_amount ? `, up to ${money(c.max_discount_amount)}` : ''}`
  return `${money(c.amount)} off`
}

export default function PromotionsPage() {
  const { values: f, set, page } = useUrlFilters(FILTERS)
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const applySearch = useCallback((v: string) => set({ search: v }), [set])
  const [search, setSearch] = useSearchBox(f.search, applySearch)
  const [editing, setEditing] = useState<Coupon | 'new' | null>(null)
  const params = { search: f.search, is_active: f.active === 'yes' ? ('1' as const) : f.active === 'no' ? ('0' as const) : undefined, page, per_page: 20 }
  const list = useQuery({ queryKey: ['coupons', params], queryFn: () => coupons.list(params), placeholderData: (prev) => prev })

  const toggle = useMutation({
    mutationFn: (c: Coupon) => coupons.update(c.id, { is_active: !c.is_active }),
    onSuccess: (c) => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] })
      toast.success(`${c.code} is ${c.is_active ? 'switched on' : 'switched off'}.`)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const remove = useMutation({
    mutationFn: (c: Coupon) => coupons.remove(c.id),
    onSuccess: (_, c) => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] })
      toast.success(`Deleted ${c.code}.`)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  return (
    <>
      <PageHeader
        title="Promotions"
        description="Discount codes customers enter at checkout. Public codes are also listed on the website’s offers."
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" aria-hidden="true" />} onClick={() => setEditing('new')}>
            Create code
          </Button>
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-rule p-4">
          <SearchInput className="w-full sm:w-64" label="Search codes" placeholder="Search codes" value={search} onChange={setSearch} />
          <FilterSelect label="Switched on" value={f.active} onChange={(e) => set({ active: e.target.value })} className="w-full sm:w-44">
            <option value="">On and off</option>
            <option value="yes">Switched on</option>
            <option value="no">Switched off</option>
          </FilterSelect>
        </div>
        {list.isError ? (
          <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
        ) : !list.data ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : list.data.data.length === 0 ? (
          <EmptyState icon={<TicketPercent className="h-5 w-5" />} title={f.search || f.active ? 'No codes match' : 'No discount codes yet'} action={!f.search && !f.active && <Button variant="primary" onClick={() => setEditing('new')}>Create a code</Button>}>
            {f.search || f.active ? 'Try another search.' : 'Create a code for a percentage or a fixed amount off.'}
          </EmptyState>
        ) : (
          <div className={cn('transition-opacity', list.isFetching && 'opacity-70')}>
            <Table label="Discount codes">
              <thead>
                <tr>
                  <th className={th}>Code</th>
                  <th className={th}>Discount</th>
                  <th className={cn(th, 'text-right')}>Minimum order</th>
                  <th className={th}>Used</th>
                  <th className={th}>Valid</th>
                  <th className={th}>State</th>
                  <th className={th}>On</th>
                  <th className={cn(th, 'text-right')}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.data.data.map((c) => {
                  const state = couponState(c)
                  const usage = c.usage_limit ? Math.min(1, c.times_used / c.usage_limit) : null
                  return (
                    <tr key={c.id} className="hover:bg-bone/[0.02]">
                      <td className={td}>
                        <p className="font-semibold tracking-wide text-bone">{c.code}</p>
                        <p className="max-w-[16rem] truncate text-xs text-dim">{c.description ?? (c.is_public ? 'Listed on the website' : 'Not listed')}</p>
                      </td>
                      <td className={cn(td, 'text-bone')}>{describeDiscount(c)}</td>
                      <td className={cn(td, 'tabular text-right text-grey')}>{c.min_order_amount ? money(c.min_order_amount) : '—'}</td>
                      <td className={cn(td, 'w-40')}>
                        <p className="tabular text-grey">
                          {count(c.times_used)}
                          {c.usage_limit ? ` of ${count(c.usage_limit)}` : ' times'}
                        </p>
                        {usage !== null && (
                          <div className="mt-1 h-1.5 w-28 rounded-full bg-ember/20" aria-hidden="true">
                            <div className="h-1.5 rounded-full bg-ember" style={{ width: `${Math.max(2, usage * 100)}%` }} />
                          </div>
                        )}
                      </td>
                      <td className={cn(td, 'whitespace-nowrap text-grey')}>
                        {c.starts_at || c.expires_at ? `${c.starts_at ? date(c.starts_at) : 'Now'} to ${c.expires_at ? date(c.expires_at) : 'no end'}` : 'Always'}
                      </td>
                      <td className={td}>
                        <Badge tone={state.tone}>{state.label}</Badge>
                      </td>
                      <td className={td}>
                        <ToggleSwitch label={`${c.code} switched on`} checked={c.is_active} onChange={() => toggle.mutate(c)} />
                      </td>
                      <td className={cn(td, 'text-right')}>
                        <div className="inline-flex">
                          <IconButton label={`Edit ${c.code}`} onClick={() => setEditing(c)}>
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </IconButton>
                          <IconButton
                            label={`Delete ${c.code}`}
                            className="hover:text-[#ff8a83]"
                            onClick={async () => {
                              if (await confirm({ title: `Delete ${c.code}?`, body: 'Customers can no longer use it. Orders that used it keep their discount.', confirmLabel: 'Delete code' })) remove.mutate(c)
                            }}
                          >
                            <Trash className="h-4 w-4" aria-hidden="true" />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
            <Pagination page={list.data.meta.current_page} lastPage={list.data.meta.last_page} total={list.data.meta.total} from={list.data.meta.from} to={list.data.meta.to} onPage={(p) => set({ page: p })} noun="codes" />
          </div>
        )}
      </Card>
      <CouponModal key={editing === 'new' ? 'new' : (editing?.id ?? 'closed')} coupon={editing} onClose={() => setEditing(null)} />
    </>
  )
}

/** ISO timestamp → value for <input type="datetime-local"> in the restaurant's timezone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}`
}

/** datetime-local value (restaurant time, UTC+5:30) → ISO with offset. */
function fromLocalInput(value: string): string | null {
  return value ? `${value}:00+05:30` : null
}

function CouponModal({ coupon, onClose }: { coupon: Coupon | 'new' | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const existing = coupon && coupon !== 'new' ? coupon : null
  const [form, setForm] = useState({
    code: existing?.code ?? '',
    description: existing?.description ?? '',
    discount_type: existing?.discount_type ?? ('percentage' as Coupon['discount_type']),
    percentage: existing?.percentage ? String(existing.percentage) : '',
    amount: centsToDollars(existing?.amount),
    max_discount_amount: centsToDollars(existing?.max_discount_amount),
    min_order_amount: centsToDollars(existing?.min_order_amount),
    usage_limit: existing?.usage_limit ? String(existing.usage_limit) : '',
    usage_limit_per_user: existing?.usage_limit_per_user ? String(existing.usage_limit_per_user) : '',
    starts_at: toLocalInput(existing?.starts_at ?? null),
    expires_at: toLocalInput(existing?.expires_at ?? null),
    is_active: existing?.is_active ?? true,
    is_public: existing?.is_public ?? false,
  })
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const update = (k: keyof typeof form, v: string | boolean) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => ({ ...e, [k]: undefined }))
  }

  const save = useMutation({
    mutationFn: (input: Partial<CouponInput>) => (existing ? coupons.update(existing.id, input) : coupons.create(input)),
    onSuccess: (c) => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] })
      toast.success(existing ? `Saved ${c.code}.` : `Created ${c.code}.`)
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
    const code = form.code.trim().toUpperCase()
    if (!/^[A-Z0-9_-]{3,40}$/.test(code)) found.code = 'Use 3 to 40 letters, numbers, dashes or underscores.'
    const pct = Number(form.percentage)
    const amount = dollarsToCents(form.amount)
    if (form.discount_type === 'percentage' && !(Number.isInteger(pct) && pct >= 1 && pct <= 100)) found.percentage = 'Enter a whole percentage from 1 to 100.'
    if (form.discount_type === 'fixed' && !(amount && amount > 0)) found.amount = 'Enter an amount in rupees.'
    const rupees = (k: 'max_discount_amount' | 'min_order_amount') => {
      if (!form[k].trim()) return null
      const v = dollarsToCents(form[k])
      if (v === null) found[k] = 'Enter an amount in rupees.'
      return v
    }
    const cap = rupees('max_discount_amount')
    const minOrder = rupees('min_order_amount')
    const whole = (k: 'usage_limit' | 'usage_limit_per_user') => {
      if (!form[k].trim()) return null
      const v = Number(form[k])
      if (!Number.isInteger(v) || v < 1) found[k] = 'Use a whole number, 1 or more.'
      return v
    }
    const limit = whole('usage_limit')
    const perUser = whole('usage_limit_per_user')
    if (form.starts_at && form.expires_at && form.expires_at <= form.starts_at) found.expires_at = 'The end must be after the start.'
    setErrors(found)
    if (Object.keys(found).length) return

    save.mutate({
      code,
      description: form.description.trim() || null,
      discount_type: form.discount_type,
      percentage: form.discount_type === 'percentage' ? pct : null,
      amount: form.discount_type === 'fixed' ? amount : null,
      max_discount_amount: form.discount_type === 'percentage' ? cap : null,
      min_order_amount: minOrder,
      usage_limit: limit,
      usage_limit_per_user: perUser,
      starts_at: fromLocalInput(form.starts_at),
      expires_at: fromLocalInput(form.expires_at),
      is_active: form.is_active,
      is_public: form.is_public,
    })
  }

  return (
    <Modal
      open={coupon !== null}
      onClose={onClose}
      size="md"
      title={existing ? `Edit ${existing.code}` : 'New discount code'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="coupon-form" loading={save.isPending}>
            {existing ? 'Save code' : 'Create code'}
          </Button>
        </>
      }
    >
      <form id="coupon-form" noValidate onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Code" value={form.code} autoCapitalize="characters" onChange={(e) => update('code', e.target.value.toUpperCase())} error={errors.code} placeholder="WEEKEND20" />
          <TextField label="Description" optional value={form.description} maxLength={255} onChange={(e) => update('description', e.target.value)} error={errors.description} placeholder="20% off on weekends" />
        </div>
        <div>
          <p className="mb-1.5 text-[0.9375rem] font-medium text-bone/85">Discount</p>
          <Segmented
            label="Discount type"
            value={form.discount_type}
            onChange={(v) => update('discount_type', v)}
            options={[
              { value: 'percentage', label: 'Percentage' },
              { value: 'fixed', label: 'Fixed amount' },
            ]}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {form.discount_type === 'percentage' ? (
            <>
              <TextField label="Percentage off" inputMode="numeric" value={form.percentage} onChange={(e) => update('percentage', e.target.value)} error={errors.percentage} placeholder="10" />
              <TextField label="Largest discount" optional prefix="$" inputMode="decimal" value={form.max_discount_amount} onChange={(e) => update('max_discount_amount', e.target.value)} error={errors.max_discount_amount} />
            </>
          ) : (
            <TextField label="Amount off" prefix="$" inputMode="decimal" value={form.amount} onChange={(e) => update('amount', e.target.value)} error={errors.amount} placeholder="3" />
          )}
          <TextField label="Minimum order" optional prefix="$" inputMode="decimal" value={form.min_order_amount} onChange={(e) => update('min_order_amount', e.target.value)} error={errors.min_order_amount} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Total uses" optional inputMode="numeric" value={form.usage_limit} onChange={(e) => update('usage_limit', e.target.value)} error={errors.usage_limit} hint="Blank means unlimited." />
          <TextField label="Uses per customer" optional inputMode="numeric" value={form.usage_limit_per_user} onChange={(e) => update('usage_limit_per_user', e.target.value)} error={errors.usage_limit_per_user} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Starts" optional type="datetime-local" value={form.starts_at} onChange={(e) => update('starts_at', e.target.value)} error={errors.starts_at} />
          <TextField label="Expires" optional type="datetime-local" value={form.expires_at} min={form.starts_at || undefined} onChange={(e) => update('expires_at', e.target.value)} error={errors.expires_at} hint="Times are Sri Lanka time." />
        </div>
        <div className="space-y-4 rounded-xl border border-rule bg-pitch/40 p-4">
          <Switch checked={form.is_active} onChange={(v) => update('is_active', v)} label="Switched on" description="Customers can use it within its dates and limits." />
          <Switch checked={form.is_public} onChange={(v) => update('is_public', v)} label="List on the website" description="Show it with the website’s offers." />
        </div>
      </form>
    </Modal>
  )
}
