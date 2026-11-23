import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Boxes, PackagePlus, Pencil, Plus, Trash } from 'lucide-react'
import { useCallback, useState, type FormEvent } from 'react'
import { cn } from '../../lib/utils'
import { Modal } from '../components/overlay'
import { useConfirm, useToast } from '../components/overlay-context'
import { StockBadge } from '../components/status'
import { Button, Card, EmptyState, ErrorState, FilterSelect, IconButton, Pagination, SearchInput, Segmented, SelectField, Skeleton, Table, TextArea, TextField, td, th } from '../components/ui'
import { PageHeader } from '../layout'
import { ApiError, errorMessage } from '../lib/api'
import { inventory } from '../lib/endpoints'
import { count, dateTime, MOVEMENT_REASON_LABEL, quantity, todayLocal, UNIT_LABEL } from '../lib/format'
import { useSearchBox, useUrlFilters } from '../lib/hooks'
import type { Ingredient, MovementReason, Unit } from '../lib/types'

const FILTERS = ['tab', 'search', 'status', 'sort', 'ingredient', 'reason', 'date_from', 'date_to', 'from', 'to'] as const

export default function InventoryPage() {
  const { values: f, set, page } = useUrlFilters(FILTERS)
  const tab = f.tab === 'history' || f.tab === 'consumption' ? f.tab : 'ingredients'
  const [editing, setEditing] = useState<Ingredient | 'new' | null>(null)
  const [adjusting, setAdjusting] = useState<Ingredient | null>(null)

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Kitchen ingredients. Orders use them up through each burger’s recipe; deliveries, stock counts and waste are recorded here."
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" aria-hidden="true" />} onClick={() => setEditing('new')}>
            Add ingredient
          </Button>
        }
      />
      <div className="mb-4">
        <Segmented
          label="Inventory view"
          value={tab}
          onChange={(v) => set({ tab: v === 'ingredients' ? null : v })}
          options={[
            { value: 'ingredients', label: 'Ingredients' },
            { value: 'history', label: 'Stock history' },
            { value: 'consumption', label: 'Consumption' },
          ]}
        />
      </div>
      {tab === 'ingredients' && <IngredientsTab f={f} set={set} onEdit={setEditing} onAdjust={setAdjusting} />}
      {tab === 'history' && <HistoryTab f={f} set={set} page={page} />}
      {tab === 'consumption' && <ConsumptionTab f={f} set={set} />}

      <IngredientModal key={`ingredient-${editing === 'new' ? 'new' : (editing?.id ?? 'closed')}`} ingredient={editing} onClose={() => setEditing(null)} />
      <AdjustModal key={`adjust-${adjusting?.id ?? 'closed'}`} ingredient={adjusting} onClose={() => setAdjusting(null)} />
    </>
  )
}

type F = Record<(typeof FILTERS)[number], string>
type SetF = ReturnType<typeof useUrlFilters<(typeof FILTERS)[number]>>['set']

function IngredientsTab({ f, set, onEdit, onAdjust }: { f: F; set: SetF; onEdit: (i: Ingredient) => void; onAdjust: (i: Ingredient) => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const applySearch = useCallback((v: string) => set({ search: v }), [set])
  const [search, setSearch] = useSearchBox(f.search, applySearch)
  const status = f.status === 'low' ? 'low_stock' : f.status === 'out' ? 'out_of_stock' : f.status === 'in' ? 'in_stock' : ''
  const params = { search: f.search, status: status as Ingredient['stock_status'] | '', sort: f.sort === 'name' ? ('name' as const) : ('urgency' as const) }
  const list = useQuery({ queryKey: ['ingredients', 'list', params], queryFn: () => inventory.list(params), placeholderData: (prev) => prev })
  const all = useQuery({ queryKey: ['ingredients', 'all'], queryFn: () => inventory.list({ sort: 'name' }) })

  const remove = useMutation({
    mutationFn: (i: Ingredient) => inventory.remove(i.id),
    onSuccess: (_, i) => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success(`Removed ${i.name}. Its history is kept.`)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const totals = {
    all: all.data?.length ?? 0,
    low: all.data?.filter((i) => i.stock_status === 'low_stock').length ?? 0,
    out: all.data?.filter((i) => i.stock_status === 'out_of_stock').length ?? 0,
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-rule p-4">
        <SearchInput className="w-full sm:w-64" label="Search ingredients" placeholder="Search ingredients" value={search} onChange={setSearch} />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Stock status">
          {[
            { key: '', label: `All ${totals.all}` },
            { key: 'low', label: `Low ${totals.low}` },
            { key: 'out', label: `Empty ${totals.out}` },
          ].map((o) => (
            <button
              key={o.key}
              type="button"
              aria-pressed={f.status === o.key}
              onClick={() => set({ status: o.key })}
              className={cn(
                'h-8 rounded-full border px-3 text-[0.9375rem] transition-colors',
                f.status === o.key ? 'border-ember/60 bg-ember/12 text-bone' : 'border-rule-strong text-grey hover:text-bone',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <FilterSelect label="Sort" value={f.sort} onChange={(e) => set({ sort: e.target.value })} className="w-full sm:w-auto sm:min-w-48">
          <option value="">Most urgent first</option>
          <option value="name">A to Z</option>
        </FilterSelect>
      </div>
      {list.isError ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : !list.data ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : list.data.length === 0 ? (
        <EmptyState icon={<Boxes className="h-5 w-5" />} title={f.search || f.status ? 'No ingredients match' : 'No ingredients yet'}>
          {f.search || f.status ? 'Try another search or filter.' : 'Add the ingredients your kitchen uses, then give each burger a recipe.'}
        </EmptyState>
      ) : (
        <Table label="Ingredients" className={cn('transition-opacity', list.isFetching && 'opacity-70')}>
          <thead>
            <tr>
              <th className={th}>Ingredient</th>
              <th className={th}>In stock</th>
              <th className={cn(th, 'text-right')}>Minimum</th>
              <th className={cn(th, 'text-right')}>Used last 7 days</th>
              <th className={cn(th, 'text-right')}>Lasts about</th>
              <th className={th}>Status</th>
              <th className={cn(th, 'text-right')}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((i) => {
              const ratio = i.min_stock_level > 0 ? Math.max(0, Math.min(1, i.stock_quantity / (i.min_stock_level * 2))) : 1
              const tone = i.stock_status === 'out_of_stock' ? 'bad' : i.stock_status === 'low_stock' ? 'warn' : 'good'
              return (
                <tr key={i.id} className="hover:bg-bone/[0.02]">
                  <td className={td}>
                    <p className="font-medium text-bone">{i.name}</p>
                    <p className="text-xs text-dim">{i.products_count ? `In ${i.products_count} recipe${i.products_count === 1 ? '' : 's'}` : 'Not in any recipe'}{i.notes ? `. ${i.notes}` : ''}</p>
                  </td>
                  <td className={cn(td, 'w-48')}>
                    <p className={cn('tabular font-medium', i.stock_quantity < 0 ? 'text-[#ff8a83]' : 'text-bone')}>{quantity(i.stock_quantity, i.unit)}</p>
                    {/* Meter against twice the minimum; track is a lighter step of the same hue. */}
                    <div className={cn('mt-1.5 h-1.5 w-36 rounded-full', tone === 'bad' ? 'bg-bad/20' : tone === 'warn' ? 'bg-warn/20' : 'bg-good/20')} aria-hidden="true">
                      <div className={cn('h-1.5 rounded-full', tone === 'bad' ? 'bg-bad' : tone === 'warn' ? 'bg-warn' : 'bg-good')} style={{ width: `${Math.max(2, ratio * 100)}%` }} />
                    </div>
                    {i.stock_quantity < 0 && <p className="mt-1 text-xs text-[#ff8a83]">Orders used more than was recorded. Count it.</p>}
                  </td>
                  <td className={cn(td, 'tabular text-right text-grey')}>{quantity(i.min_stock_level, i.unit)}</td>
                  <td className={cn(td, 'tabular text-right text-grey')}>{i.used_last_7_days ? quantity(i.used_last_7_days, i.unit) : '—'}</td>
                  <td className={cn(td, 'tabular text-right', i.days_of_cover !== null && i.days_of_cover < 3 ? 'text-warn' : 'text-grey')}>
                    {i.days_of_cover === null ? '—' : i.days_of_cover < 1 ? 'Under a day' : `${Math.floor(i.days_of_cover)} day${Math.floor(i.days_of_cover) === 1 ? '' : 's'}`}
                  </td>
                  <td className={td}>
                    <StockBadge status={i.stock_status} />
                  </td>
                  <td className={cn(td, 'text-right')}>
                    <div className="inline-flex items-center gap-1">
                      <Button size="sm" icon={<PackagePlus className="h-3.5 w-3.5" aria-hidden="true" />} onClick={() => onAdjust(i)}>
                        Record stock
                      </Button>
                      <IconButton label={`Edit ${i.name}`} onClick={() => onEdit(i)}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        label={`Remove ${i.name}`}
                        className="hover:text-[#ff8a83]"
                        onClick={async () => {
                          if (
                            await confirm({
                              title: `Remove ${i.name}?`,
                              body: i.products_count ? `It’s taken out of ${i.products_count} recipe${i.products_count === 1 ? '' : 's'}. Its stock history is kept.` : 'Its stock history is kept.',
                              confirmLabel: 'Remove ingredient',
                            })
                          )
                            remove.mutate(i)
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
      )}
    </Card>
  )
}

function HistoryTab({ f, set, page }: { f: F; set: SetF; page: number }) {
  const all = useQuery({ queryKey: ['ingredients', 'all'], queryFn: () => inventory.list({ sort: 'name' }) })
  const params = {
    ingredient_id: f.ingredient ? Number(f.ingredient) : undefined,
    reason: f.reason as MovementReason | '',
    date_from: f.date_from,
    date_to: f.date_to,
    page,
    per_page: 25,
  }
  const list = useQuery({ queryKey: ['ingredients', 'movements', params], queryFn: () => inventory.movements(params), placeholderData: (prev) => prev })

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-2 border-b border-rule p-4">
        <FilterSelect label="Ingredient" value={f.ingredient} onChange={(e) => set({ ingredient: e.target.value })} className="w-full sm:w-auto sm:min-w-56">
          <option value="">All ingredients</option>
          {all.data?.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Reason" value={f.reason} onChange={(e) => set({ reason: e.target.value })} className="w-full sm:w-auto sm:min-w-48">
          <option value="">Any reason</option>
          {(Object.keys(MOVEMENT_REASON_LABEL) as MovementReason[]).map((r) => (
            <option key={r} value={r}>
              {MOVEMENT_REASON_LABEL[r]}
            </option>
          ))}
        </FilterSelect>
        <TextField label="From" type="date" value={f.date_from} onChange={(e) => set({ date_from: e.target.value })} className="w-[calc(50%-0.25rem)] sm:w-40" />
        <TextField label="To" type="date" value={f.date_to} onChange={(e) => set({ date_to: e.target.value })} className="w-[calc(50%-0.25rem)] sm:w-40" />
      </div>
      {list.isError ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : !list.data ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : list.data.data.length === 0 ? (
        <EmptyState icon={<Boxes className="h-5 w-5" />} title="No stock movements">Movements appear when orders are placed or stock is recorded.</EmptyState>
      ) : (
        <div className={cn('transition-opacity', list.isFetching && 'opacity-70')}>
          <Table label="Stock history">
            <thead>
              <tr>
                <th className={th}>When</th>
                <th className={th}>Ingredient</th>
                <th className={th}>Reason</th>
                <th className={cn(th, 'text-right')}>Change</th>
                <th className={cn(th, 'text-right')}>Stock after</th>
                <th className={th}>By</th>
              </tr>
            </thead>
            <tbody>
              {list.data.data.map((m) => (
                <tr key={m.id}>
                  <td className={cn(td, 'tabular whitespace-nowrap text-grey')}>{dateTime(m.created_at)}</td>
                  <td className={cn(td, 'text-bone')}>{m.ingredient?.name}</td>
                  <td className={cn(td, 'text-grey')}>
                    {m.reason_label}
                    {m.order_number && <span className="text-dim"> ({m.order_number})</span>}
                    {m.note && <span className="block text-xs text-dim">“{m.note}”</span>}
                  </td>
                  <td className={cn(td, 'tabular text-right font-medium', m.change > 0 ? 'text-[#6fd981]' : 'text-grey')}>
                    {m.change > 0 ? '+' : ''}
                    {quantity(m.change, m.ingredient?.unit)}
                  </td>
                  <td className={cn(td, 'tabular text-right text-grey')}>{quantity(m.quantity_after, m.ingredient?.unit)}</td>
                  <td className={cn(td, 'text-grey')}>{m.user ?? (m.order_number ? 'Order' : 'System')}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={list.data.meta.current_page} lastPage={list.data.meta.last_page} total={list.data.meta.total} from={list.data.meta.from} to={list.data.meta.to} onPage={(p) => set({ page: p })} noun="movements" />
        </div>
      )}
    </Card>
  )
}

function ConsumptionTab({ f, set }: { f: F; set: SetF }) {
  const from = f.from || todayLocal(-29)
  const to = f.to || todayLocal()
  const report = useQuery({ queryKey: ['ingredients', 'consumption', from, to], queryFn: () => inventory.consumption({ from, to }), placeholderData: (prev) => prev })

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-2 border-b border-rule p-4">
        <TextField label="From" type="date" value={from} max={to} onChange={(e) => set({ from: e.target.value })} className="w-[calc(50%-0.25rem)] sm:w-40" />
        <TextField label="To" type="date" value={to} min={from} onChange={(e) => set({ to: e.target.value })} className="w-[calc(50%-0.25rem)] sm:w-40" />
        <p className="pb-2.5 text-[0.9375rem] text-dim">Amounts are in each ingredient’s own unit.</p>
      </div>
      {report.isError ? (
        <ErrorState message={errorMessage(report.error)} onRetry={() => report.refetch()} />
      ) : !report.data ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : report.data.ingredients.length === 0 ? (
        <EmptyState icon={<Boxes className="h-5 w-5" />} title="Nothing used in this period">Try a wider date range.</EmptyState>
      ) : (
        <Table label={`Ingredient consumption ${report.data.from} to ${report.data.to}`} className={cn('transition-opacity', report.isFetching && 'opacity-70')}>
          <thead>
            <tr>
              <th className={th}>Ingredient</th>
              <th className={cn(th, 'text-right')}>Used by orders</th>
              <th className={cn(th, 'text-right')}>Average per day</th>
              <th className={cn(th, 'text-right')}>Restocked</th>
              <th className={cn(th, 'text-right')}>Wasted</th>
              <th className={cn(th, 'text-right')}>Count corrections</th>
              <th className={cn(th, 'text-right')}>In stock now</th>
            </tr>
          </thead>
          <tbody>
            {report.data.ingredients.map((r) => {
              const days = Math.max(1, Math.round((Date.parse(report.data!.to) - Date.parse(report.data!.from)) / 86_400_000) + 1)
              return (
                <tr key={r.id}>
                  <td className={cn(td, 'text-bone')}>
                    {r.name}
                    {r.deleted && <span className="ml-2 text-xs text-dim">(removed)</span>}
                  </td>
                  <td className={cn(td, 'tabular text-right font-medium text-bone')}>{quantity(r.used, r.unit)}</td>
                  <td className={cn(td, 'tabular text-right text-grey')}>{quantity(Math.round((r.used / days) * 10) / 10, r.unit)}</td>
                  <td className={cn(td, 'tabular text-right text-grey')}>{r.restocked ? quantity(r.restocked, r.unit) : '—'}</td>
                  <td className={cn(td, 'tabular text-right', r.wasted ? 'text-warn' : 'text-grey')}>{r.wasted ? quantity(r.wasted, r.unit) : '—'}</td>
                  <td className={cn(td, 'tabular text-right text-grey')}>{r.adjusted ? `${r.adjusted > 0 ? '+' : ''}${quantity(r.adjusted, r.unit)}` : '—'}</td>
                  <td className={cn(td, 'tabular text-right text-grey')}>{quantity(r.stock_quantity, r.unit)}</td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      )}
      {report.data && <p className="border-t border-rule px-5 py-3 text-xs text-dim">{count(report.data.ingredients.length)} ingredients moved between {report.data.from} and {report.data.to}.</p>}
    </Card>
  )
}

function IngredientModal({ ingredient, onClose }: { ingredient: Ingredient | 'new' | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const existing = ingredient && ingredient !== 'new' ? ingredient : null
  const [name, setName] = useState(existing?.name ?? '')
  const [unit, setUnit] = useState<Unit>(existing?.unit ?? 'pcs')
  const [opening, setOpening] = useState('0')
  const [min, setMin] = useState(String(existing?.min_stock_level ?? 0))
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})

  const save = useMutation({
    mutationFn: () =>
      existing
        ? inventory.update(existing.id, { name: name.trim(), min_stock_level: Number(min), notes: notes.trim() || null })
        : inventory.create({ name: name.trim(), unit, stock_quantity: Number(opening), min_stock_level: Number(min), notes: notes.trim() || null }),
    onSuccess: (i) => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success(existing ? `Saved ${i.name}.` : `Added ${i.name}.`)
      onClose()
    },
    onError: (e) => {
      const err = ApiError.from(e)
      if (err.code !== 'validation_failed') return toast.error(err.message)
      setErrors({ name: err.field('name'), unit: err.field('unit'), opening: err.field('stock_quantity'), min: err.field('min_stock_level'), notes: err.field('notes') })
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const found: Record<string, string> = {}
    if (name.trim().length < 2) found.name = 'Give the ingredient a name.'
    if (!(Number(min) >= 0) || min.trim() === '') found.min = 'Enter 0 or more.'
    if (!existing && (!(Number(opening) >= 0) || opening.trim() === '')) found.opening = 'Enter 0 or more.'
    setErrors(found)
    if (Object.keys(found).length === 0) save.mutate()
  }

  return (
    <Modal
      open={ingredient !== null}
      onClose={onClose}
      size="md"
      title={existing ? `Edit ${existing.name}` : 'New ingredient'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="ingredient-form" loading={save.isPending}>
            {existing ? 'Save ingredient' : 'Add ingredient'}
          </Button>
        </>
      }
    >
      <form id="ingredient-form" noValidate onSubmit={submit} className="space-y-4">
        <TextField label="Name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder="Brioche bun" />
        {existing ? (
          <p className="text-sm text-grey">
            Counted in <span className="text-bone">{UNIT_LABEL[existing.unit].toLowerCase()}</span>. The unit is fixed once an ingredient has stock history.
          </p>
        ) : (
          <SelectField label="Unit" value={unit} onChange={(e) => setUnit(e.target.value as Unit)} error={errors.unit}>
            {(Object.keys(UNIT_LABEL) as Unit[]).map((u) => (
              <option key={u} value={u}>
                {UNIT_LABEL[u]}
              </option>
            ))}
          </SelectField>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {!existing && <TextField label={`Opening stock (${unit})`} inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} error={errors.opening} />}
          <TextField label={`Minimum level (${existing?.unit ?? unit})`} inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} error={errors.min} hint="Reported as low stock at or below this." />
        </div>
        <TextArea label="Notes" optional rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} error={errors.notes} placeholder="Supplier, storage…" />
      </form>
    </Modal>
  )
}

const MODES = [
  { value: 'restock', label: 'Delivery', verb: 'Amount received' },
  { value: 'adjustment', label: 'Stock count', verb: 'Amount counted' },
  { value: 'waste', label: 'Waste', verb: 'Amount thrown away' },
] as const

function AdjustModal({ ingredient, onClose }: { ingredient: Ingredient | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [mode, setMode] = useState<(typeof MODES)[number]['value']>('restock')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string>()
  const value = Number(amount)
  const current = ingredient?.stock_quantity ?? 0
  const after = amount.trim() === '' || Number.isNaN(value) ? null : mode === 'restock' ? current + value : mode === 'waste' ? current - value : value

  const save = useMutation({
    mutationFn: () =>
      inventory.adjust(ingredient!.id, mode === 'adjustment' ? { reason: mode, set_to: value, note: note || undefined } : { reason: mode, change: value, note: note || undefined }),
    onSuccess: ({ data }) => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success(`${data.ingredient.name} now at ${quantity(data.ingredient.stock_quantity, data.ingredient.unit)}.`)
      onClose()
    },
    onError: (e) => {
      const err = ApiError.from(e)
      setError(err.field('change') ?? err.field('set_to') ?? err.message)
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (amount.trim() === '' || Number.isNaN(value) || value < 0 || (mode !== 'adjustment' && value === 0)) return setError('Enter an amount above zero.')
    if (after !== null && after < 0) return setError('That would take stock below zero.')
    setError(undefined)
    save.mutate()
  }

  const unit = ingredient?.unit
  return (
    <Modal
      open={ingredient !== null}
      onClose={onClose}
      size="md"
      title={`Record stock: ${ingredient?.name ?? ''}`}
      description={ingredient && <>In stock now: <span className="tabular text-bone">{quantity(current, unit)}</span></>}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="adjust-form" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id="adjust-form" noValidate onSubmit={submit} className="space-y-4">
        <Segmented label="What happened" value={mode} onChange={(m) => {
            setMode(m)
            setError(undefined)
          }} options={MODES.map(({ value: v, label }) => ({ value: v, label }))} />
        <TextField label={`${MODES.find((m) => m.value === mode)!.verb} (${unit ?? ''})`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} error={error} data-autofocus />
        <TextArea label="Note" optional rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === 'restock' ? 'Supplier and invoice number' : mode === 'waste' ? 'What happened' : 'Who counted'} />
        {after !== null && after >= 0 && (
          <p className="text-sm text-grey">
            Stock after saving: <span className="tabular font-semibold text-bone">{quantity(Math.round(after * 1000) / 1000, unit)}</span>
          </p>
        )}
      </form>
    </Modal>
  )
}
