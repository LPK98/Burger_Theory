import { useQuery } from '@tanstack/react-query'
import { Mail, MapPin, Phone, Users } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link } from 'react-router'
import { cn } from '../../lib/utils'
import { Drawer } from '../components/overlay'
import { OrderStatusBadge } from '../components/status'
import { Badge, Card, EmptyState, ErrorState, FilterSelect, Pagination, SearchInput, Skeleton, Table, td, th } from '../components/ui'
import { PageHeader } from '../layout'
import { errorMessage } from '../lib/api'
import { customers, orders } from '../lib/endpoints'
import { ago, count, date, dateTime, money, moneyWhole } from '../lib/format'
import { useSearchBox, useUrlFilters } from '../lib/hooks'

const FILTERS = ['customer', 'search', 'sort', 'ordered'] as const

export default function CustomersPage() {
  const { values: f, set, page } = useUrlFilters(FILTERS)
  const applySearch = useCallback((v: string) => set({ search: v }), [set])
  const [search, setSearch] = useSearchBox(f.search, applySearch)
  const params = { search: f.search, sort: f.sort, has_orders: f.ordered === 'yes' ? ('1' as const) : f.ordered === 'no' ? ('0' as const) : undefined, page, per_page: 20 }
  const list = useQuery({ queryKey: ['customers', params], queryFn: () => customers.list(params), placeholderData: (prev) => prev })
  const filtered = Boolean(f.search || f.ordered)

  return (
    <>
      <PageHeader title="Customers" description="Everyone with an account on the website. Spending counts paid orders that weren’t cancelled." />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-rule p-4">
          <SearchInput className="w-full sm:w-72" label="Search customers" placeholder="Name, email or phone" value={search} onChange={setSearch} />
          <FilterSelect label="Orders" value={f.ordered} onChange={(e) => set({ ordered: e.target.value })} className="w-[calc(50%-0.25rem)] sm:w-48">
            <option value="">Everyone</option>
            <option value="yes">Has ordered</option>
            <option value="no">Never ordered</option>
          </FilterSelect>
          <FilterSelect label="Sort" value={f.sort} onChange={(e) => set({ sort: e.target.value })} className="w-[calc(50%-0.25rem)] sm:w-48">
            <option value="">Newest accounts</option>
            <option value="spent">Highest spending</option>
            <option value="orders">Most orders</option>
            <option value="last_order">Ordered most recently</option>
            <option value="name">Name A to Z</option>
            <option value="oldest">Oldest accounts</option>
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
        ) : list.data.data.length === 0 ? (
          <EmptyState icon={<Users className="h-5 w-5" />} title={filtered ? 'No customers match' : 'No customers yet'}>
            {filtered ? 'Try another search.' : 'Customers appear here when they sign up on the website.'}
          </EmptyState>
        ) : (
          <div className={cn('transition-opacity', list.isFetching && 'opacity-70')}>
            <Table label="Customers">
              <thead>
                <tr>
                  <th className={th}>Customer</th>
                  <th className={th}>Phone</th>
                  <th className={cn(th, 'text-right')}>Orders</th>
                  <th className={cn(th, 'text-right')}>Total spent</th>
                  <th className={th}>Last order</th>
                  <th className={th}>Registered</th>
                </tr>
              </thead>
              <tbody>
                {list.data.data.map((c) => (
                  <tr key={c.id} className="cursor-pointer hover:bg-bone/[0.025]" onClick={() => set({ customer: c.id, page })}>
                    <td className={td}>
                      <button
                        type="button"
                        className="font-medium text-bone hover:text-ember-hot"
                        onClick={(e) => {
                          e.stopPropagation()
                          set({ customer: c.id, page })
                        }}
                      >
                        {c.name}
                      </button>
                      <p className="text-xs text-dim">{c.email}</p>
                    </td>
                    <td className={cn(td, 'tabular text-grey')}>{c.phone ?? '—'}</td>
                    <td className={cn(td, 'tabular text-right text-bone')}>{count(c.orders_count)}</td>
                    <td className={cn(td, 'tabular text-right text-bone')}>{money(c.total_spent)}</td>
                    <td className={cn(td, 'text-grey')}>{c.last_order_at ? ago(c.last_order_at) : <span className="text-dim">Never</span>}</td>
                    <td className={cn(td, 'tabular text-grey')}>{date(c.registered_at)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={list.data.meta.current_page} lastPage={list.data.meta.last_page} total={list.data.meta.total} from={list.data.meta.from} to={list.data.meta.to} onPage={(p) => set({ page: p })} noun="customers" />
          </div>
        )}
      </Card>
      <CustomerDrawer id={f.customer ? Number(f.customer) : null} onClose={() => set({ customer: null, page })} />
    </>
  )
}

function CustomerDrawer({ id, onClose }: { id: number | null; onClose: () => void }) {
  const [historyPage, setHistoryPage] = useState(1)
  const detail = useQuery({ queryKey: ['customer', id], queryFn: () => customers.get(id!), enabled: id !== null })
  const history = useQuery({
    queryKey: ['orders', 'list', { customer_id: id, page: historyPage, per_page: 8 }],
    queryFn: () => orders.list({ customer_id: id!, page: historyPage, per_page: 8 }),
    enabled: id !== null,
    placeholderData: (prev) => prev,
  })
  const c = detail.data

  return (
    <Drawer
      open={id !== null}
      onClose={() => {
        setHistoryPage(1)
        onClose()
      }}
      width="lg"
      title={c?.name ?? 'Customer'}
      description={c && <span className="text-dim">Customer since {date(c.registered_at)}</span>}
    >
      {detail.isError ? (
        <ErrorState message={errorMessage(detail.error)} onRetry={() => detail.refetch()} />
      ) : !c ? (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-48" />
        </div>
      ) : (
        <div className="space-y-7">
          <section className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-grey">
            <a href={`mailto:${c.email}`} className="flex items-center gap-2 hover:text-bone">
              <Mail className="h-3.5 w-3.5 text-dim" aria-hidden="true" />
              {c.email}
            </a>
            {c.phone && (
              <a href={`tel:${c.phone}`} className="flex items-center gap-2 hover:text-bone">
                <Phone className="h-3.5 w-3.5 text-dim" aria-hidden="true" />
                {c.phone}
              </a>
            )}
            {c.email_verified ? <Badge tone="good">Email verified</Badge> : <Badge>Email not verified</Badge>}
          </section>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Orders', value: count(c.orders_count) },
              { label: 'Total spent', value: moneyWhole(c.total_spent) },
              { label: 'Average order', value: c.paid_orders ? moneyWhole(c.average_order_value) : '—' },
              { label: 'Cancelled', value: count(c.cancelled_orders) },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-rule bg-pitch/40 p-3">
                <dt className="text-xs text-dim">{s.label}</dt>
                <dd className="mt-1 text-lg font-semibold text-bone">{s.value}</dd>
              </div>
            ))}
          </dl>

          {c.favourite_products.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-medium text-dim">Usually orders</h3>
              <ul className="flex flex-wrap gap-2">
                {c.favourite_products.map((p) => (
                  <li key={p.name} className="rounded-full border border-rule-strong px-3 py-1 text-sm text-bone">
                    {p.name} <span className="tabular text-dim">×{p.quantity}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {c.addresses.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-medium text-dim">Saved addresses</h3>
              <ul className="space-y-2">
                {c.addresses.map((a) => (
                  <li key={a.id} className="flex gap-2 text-sm text-grey">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-dim" aria-hidden="true" />
                    <span>
                      {a.label && <span className="text-bone">{a.label}: </span>}
                      {[a.line1, a.line2, a.city, a.postal_code].filter(Boolean).join(', ')}
                      {a.is_default && <Badge className="ml-2">Default</Badge>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="history-title">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h3 id="history-title" className="text-xs font-medium text-dim">
                Order history
              </h3>
              {c.orders_count > 0 && (
                <Link to={`/orders?customer_id=${c.id}`} className="text-[0.9375rem] text-ember-hot hover:underline">
                  Open in Orders
                </Link>
              )}
            </div>
            {history.isError ? (
              <ErrorState message={errorMessage(history.error)} onRetry={() => history.refetch()} />
            ) : !history.data ? (
              <Skeleton className="h-40" />
            ) : history.data.data.length === 0 ? (
              <p className="text-sm text-dim">No orders yet.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-rule">
                <table className="w-full text-sm">
                  <caption className="sr-only">Orders by {c.name}</caption>
                  <tbody>
                    {history.data.data.map((o) => (
                      <tr key={o.order_number} className="border-b border-rule/70 last:border-0">
                        <td className="px-3 py-2.5">
                          <Link to={`/orders?order=${encodeURIComponent(o.order_number)}`} className="font-medium text-bone hover:text-ember-hot">
                            {o.order_number}
                          </Link>
                          <p className="text-xs text-dim">{dateTime(o.created_at)}</p>
                        </td>
                        <td className="max-w-[12rem] truncate px-3 py-2.5 text-grey">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</td>
                        <td className="tabular px-3 py-2.5 text-right text-bone">{money(o.total)}</td>
                        <td className="px-3 py-2.5 text-right">
                          <OrderStatusBadge status={o.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination
                  page={history.data.meta.current_page}
                  lastPage={history.data.meta.last_page}
                  total={history.data.meta.total}
                  from={history.data.meta.from}
                  to={history.data.meta.to}
                  onPage={setHistoryPage}
                  noun="orders"
                />
              </div>
            )}
          </section>
        </div>
      )}
    </Drawer>
  )
}
