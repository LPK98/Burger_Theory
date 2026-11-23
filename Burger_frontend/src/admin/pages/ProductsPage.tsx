import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Hamburger, Pencil, Plus, RotateCcw, Star, Trash } from 'lucide-react'
import { useCallback } from 'react'
import { cn } from '../../lib/utils'
import { useConfirm, useToast } from '../components/overlay-context'
import { ProductEditor } from '../components/ProductEditor'
import { StockBadge } from '../components/status'
import { Badge, Button, Card, EmptyState, ErrorState, FilterSelect, IconButton, Pagination, SearchInput, Segmented, Skeleton, Switch, Table, ToggleSwitch, td, th } from '../components/ui'
import { PageHeader } from '../layout'
import { errorMessage } from '../lib/api'
import { categories, products } from '../lib/endpoints'
import { money } from '../lib/format'
import { useSearchBox, useUrlFilters } from '../lib/hooks'
import type { Product } from '../lib/types'

const FILTERS = ['view', 'edit', 'search', 'category', 'available', 'stock', 'deleted'] as const

export default function ProductsPage() {
  const { values: f, set, page } = useUrlFilters(FILTERS)
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const applySearch = useCallback((v: string) => set({ search: v }), [set])
  const [search, setSearch] = useSearchBox(f.search, applySearch)
  const view = f.view === 'table' ? 'table' : 'grid'

  const params = {
    search: f.search,
    category: f.category,
    is_available: f.available === 'yes' ? ('1' as const) : f.available === 'no' ? ('0' as const) : undefined,
    stock_status: f.stock,
    with_trashed: f.deleted === '1' ? ('1' as const) : undefined,
    page,
    per_page: 24,
  }
  const list = useQuery({ queryKey: ['products', 'list', params], queryFn: () => products.list(params), placeholderData: (prev) => prev })
  const cats = useQuery({ queryKey: ['categories'], queryFn: categories.list })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['products'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }
  const toggle = useMutation({
    mutationFn: ({ p, changes }: { p: Product; changes: { is_available?: boolean; is_featured?: boolean } }) => products.update(p.id, changes),
    onSuccess: (saved, { changes }) => {
      queryClient.setQueryData(['product', saved.id], saved)
      invalidate()
      toast.success(
        'is_featured' in changes
          ? `${saved.name} is ${saved.is_featured ? 'now featured' : 'no longer featured'}.`
          : `${saved.name} is ${saved.is_available ? 'back on the menu' : 'hidden from the menu'}.`,
      )
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const remove = useMutation({
    mutationFn: (p: Product) => products.remove(p.id),
    onSuccess: (_, p) => {
      invalidate()
      toast.success(`Deleted ${p.name}. Show deleted products to restore it.`)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const restore = useMutation({
    mutationFn: (p: Product) => products.restore(p.id),
    onSuccess: (saved) => {
      invalidate()
      toast.success(`Restored ${saved.name}.`)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const askDelete = async (p: Product) => {
    if (await confirm({ title: `Delete ${p.name}?`, body: 'It leaves the menu and every cart. Past orders keep their copy, and you can restore it later.', confirmLabel: 'Delete product' })) remove.mutate(p)
  }

  const filtered = Boolean(f.search || f.category || f.available || f.stock)
  const editing = f.edit === 'new' ? 'new' : f.edit ? Number(f.edit) : null

  return (
    <>
      <PageHeader
        title="Products"
        description="The burgers on the menu: prices in LKR, photos, availability, stock and recipes."
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" aria-hidden="true" />} onClick={() => set({ edit: 'new', page })}>
            Add product
          </Button>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-rule p-4">
          <SearchInput className="w-full sm:w-64" label="Search products" placeholder="Search products" value={search} onChange={setSearch} />
          <FilterSelect label="Category" value={f.category} onChange={(e) => set({ category: e.target.value })} className="w-[calc(50%-0.25rem)] sm:w-40">
            <option value="">All categories</option>
            {cats.data?.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Availability" value={f.available} onChange={(e) => set({ available: e.target.value })} className="w-[calc(50%-0.25rem)] sm:w-48">
            <option value="">On or off the menu</option>
            <option value="yes">On the menu</option>
            <option value="no">Hidden</option>
          </FilterSelect>
          <FilterSelect label="Stock" value={f.stock} onChange={(e) => set({ stock: e.target.value })} className="w-[calc(50%-0.25rem)] sm:w-40">
            <option value="">Any stock</option>
            <option value="in_stock">In stock</option>
            <option value="low_stock">Low stock</option>
            <option value="out_of_stock">Out of stock</option>
            <option value="unlimited">Made to order</option>
          </FilterSelect>
          <label className="flex h-10 items-center gap-2 px-2 text-sm text-grey">
            <input type="checkbox" className="h-4 w-4 accent-[#ea5f17]" checked={f.deleted === '1'} onChange={(e) => set({ deleted: e.target.checked ? '1' : null })} />
            Show deleted
          </label>
          <span className="flex-1" />
          <Segmented
            size="sm"
            label="Layout"
            value={view}
            onChange={(v) => set({ view: v === 'table' ? 'table' : null, page })}
            options={[
              { value: 'grid', label: 'Cards' },
              { value: 'table', label: 'Table' },
            ]}
          />
        </div>

        {list.isError ? (
          <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
        ) : !list.data ? (
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-72" />
            ))}
          </div>
        ) : list.data.data.length === 0 ? (
          <EmptyState
            icon={<Hamburger className="h-5 w-5" />}
            title={filtered ? 'No products match' : 'No products yet'}
            action={!filtered && <Button variant="primary" onClick={() => set({ edit: 'new' })}>Add the first product</Button>}
          >
            {filtered ? 'Try another search or clear the filters.' : 'Add a burger to start the menu.'}
          </EmptyState>
        ) : (
          <div className={cn('transition-opacity', list.isFetching && 'opacity-70')}>
            {view === 'grid' ? (
              <ul className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {list.data.data.map((p) => (
                  <li key={p.id} className={cn('group flex flex-col overflow-hidden rounded-2xl border bg-pitch/50 transition-colors hover:border-rule-strong', p.deleted_at ? 'border-bad/30 opacity-70' : 'border-rule')}>
                    <button type="button" onClick={() => set({ edit: p.id, page })} className="relative grid h-44 place-items-center bg-[radial-gradient(18rem_10rem_at_50%_100%,rgb(234_95_23/0.16),transparent_70%)]" aria-label={`Edit ${p.name}`}>
                      {p.image ? (
                        <img src={p.image.url} alt="" className="h-36 w-auto max-w-[85%] object-contain drop-shadow-[0_18px_22px_rgb(0_0_0/0.55)] transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover:scale-[1.04]" />
                      ) : (
                        <Hamburger className="h-12 w-12 text-dim" aria-hidden="true" />
                      )}
                      {p.is_featured && (
                        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-ember px-2 py-0.5 text-xs font-semibold text-ember-ink">
                          <Star className="h-3 w-3 fill-current" aria-hidden="true" />
                          Featured
                        </span>
                      )}
                    </button>
                    <div className="flex flex-1 flex-col gap-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold text-bone">{p.name}</h3>
                          <p className="truncate text-xs text-dim">{p.categories.map((c) => c.name).join(', ') || 'No category'}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="tabular font-semibold text-bone">{money(p.price)}</p>
                          {p.compare_at_price && <p className="tabular text-xs text-dim line-through">{money(p.compare_at_price)}</p>}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {p.deleted_at ? <Badge tone="bad">Deleted</Badge> : !p.is_available && <Badge tone="neutral">Hidden</Badge>}
                        <StockBadge status={p.stock_status} />
                        {p.track_stock && <span className="tabular text-xs leading-5 text-dim">{p.stock_quantity} left</span>}
                      </div>
                      <div className="mt-auto flex items-center justify-between gap-2 border-t border-rule pt-3">
                        {p.deleted_at ? (
                          <Button size="sm" icon={<RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />} loading={restore.isPending && restore.variables?.id === p.id} onClick={() => restore.mutate(p)}>
                            Restore
                          </Button>
                        ) : (
                          <div className="w-40">
                            <Switch label="On the menu" checked={p.is_available} disabled={toggle.isPending && toggle.variables?.p.id === p.id} onChange={(v) => toggle.mutate({ p, changes: { is_available: v } })} />
                          </div>
                        )}
                        <div className="flex">
                          <IconButton label={`Edit ${p.name}`} onClick={() => set({ edit: p.id, page })}>
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </IconButton>
                          {!p.deleted_at && (
                            <IconButton label={`Delete ${p.name}`} className="hover:text-[#ff8a83]" onClick={() => askDelete(p)}>
                              <Trash className="h-4 w-4" aria-hidden="true" />
                            </IconButton>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Table label="Products">
                <thead>
                  <tr>
                    <th className={th}>Product</th>
                    <th className={th}>Categories</th>
                    <th className={cn(th, 'text-right')}>Price</th>
                    <th className={th}>Stock</th>
                    <th className={th}>On the menu</th>
                    <th className={th}>Featured</th>
                    <th className={cn(th, 'text-right')}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.data.map((p) => (
                    <tr key={p.id} className={cn('hover:bg-bone/[0.02]', p.deleted_at && 'opacity-60')}>
                      <td className={td}>
                        <div className="flex items-center gap-3">
                          <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-pitch">
                            {p.image ? <img src={p.image.url} alt="" className="h-10 w-10 object-contain" /> : <Hamburger className="h-5 w-5 text-dim" aria-hidden="true" />}
                          </div>
                          <div className="min-w-0">
                            <button type="button" onClick={() => set({ edit: p.id, page })} className="font-medium text-bone hover:text-ember-hot">
                              {p.name}
                            </button>
                            <p className="text-xs text-dim">/{p.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className={cn(td, 'text-grey')}>{p.categories.map((c) => c.name).join(', ')}</td>
                      <td className={cn(td, 'tabular text-right text-bone')}>{money(p.price)}</td>
                      <td className={td}>
                        <div className="flex items-center gap-2">
                          <StockBadge status={p.stock_status} />
                          {p.track_stock && <span className="tabular text-xs text-dim">{p.stock_quantity}</span>}
                        </div>
                      </td>
                      <td className={td}>
                        {p.deleted_at ? (
                          <Badge tone="bad">Deleted</Badge>
                        ) : (
                          <ToggleSwitch label={`${p.name} on the menu`} checked={p.is_available} onChange={(v) => toggle.mutate({ p, changes: { is_available: v } })} />
                        )}
                      </td>
                      <td className={td}>{!p.deleted_at && <ToggleSwitch label={`Feature ${p.name}`} checked={p.is_featured} onChange={(v) => toggle.mutate({ p, changes: { is_featured: v } })} />}</td>
                      <td className={cn(td, 'text-right')}>
                        <div className="inline-flex">
                          {p.deleted_at ? (
                            <Button size="sm" onClick={() => restore.mutate(p)}>
                              Restore
                            </Button>
                          ) : (
                            <>
                              <IconButton label={`Edit ${p.name}`} onClick={() => set({ edit: p.id, page })}>
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                              </IconButton>
                              <IconButton label={`Delete ${p.name}`} className="hover:text-[#ff8a83]" onClick={() => askDelete(p)}>
                                <Trash className="h-4 w-4" aria-hidden="true" />
                              </IconButton>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            <Pagination page={list.data.meta.current_page} lastPage={list.data.meta.last_page} total={list.data.meta.total} from={list.data.meta.from} to={list.data.meta.to} onPage={(p) => set({ page: p })} noun="products" />
          </div>
        )}
      </Card>

      <ProductEditor productId={editing} onClose={() => set({ edit: null, page })} onCreated={(id) => set({ edit: id, page })} />
    </>
  )
}
