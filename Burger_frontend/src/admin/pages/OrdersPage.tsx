import { useQuery } from '@tanstack/react-query'
import { Clock, CreditCard, ReceiptText, ShoppingBag, Truck } from 'lucide-react'
import { useCallback, useState } from 'react'
import { cn } from '../../lib/utils'
import { useOrderStatus } from '../components/order-actions'
import { OrderDrawer, ReasonModal } from '../components/OrderDrawer'
import { OrderStatusBadge, PaymentStatusBadge } from '../components/status'
import { Button, Card, EmptyState, ErrorState, FilterSelect, Pagination, SearchInput, Segmented, Skeleton, Table, TextField, td, th } from '../components/ui'
import { PageHeader } from '../layout'
import { errorMessage } from '../lib/api'
import { orders } from '../lib/endpoints'
import { dateTime, money, ORDER_STATUS_ACTION, ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from '../lib/format'
import { useNow, useSearchBox, useUrlFilters } from '../lib/hooks'
import type { Order, OrderStatus, PaymentMethod, PaymentStatus } from '../lib/types'

const FILTERS = ['view', 'order', 'search', 'status', 'payment_status', 'payment_method', 'fulfilment_type', 'date_from', 'date_to', 'sort', 'customer_id'] as const
const ACTIVE: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery']

export default function OrdersPage() {
  const { values: f, set, page } = useUrlFilters(FILTERS)
  const view = f.view === 'board' ? 'board' : 'list'

  return (
    <>
      <PageHeader
        title="Orders"
        description={view === 'board' ? 'Live orders by stage, oldest first. The board refreshes every 15 seconds.' : 'Search, filter and open any order to see its full details and history.'}
        actions={
          <Segmented
            label="Orders view"
            value={view}
            onChange={(v) => set({ view: v === 'board' ? 'board' : null })}
            options={[
              { value: 'list', label: 'List' },
              { value: 'board', label: 'Kitchen board' },
            ]}
          />
        }
      />
      {view === 'board' ? <KitchenBoard onOpen={(n) => set({ order: n })} /> : <OrderList f={f} set={set} page={page} />}
      <OrderDrawer orderNumber={f.order || null} onClose={() => set({ order: null, page })} />
    </>
  )
}

type Filters = Record<(typeof FILTERS)[number], string>
type SetFilters = ReturnType<typeof useUrlFilters<(typeof FILTERS)[number]>>['set']

function OrderList({ f, set, page }: { f: Filters; set: SetFilters; page: number }) {
  const applySearch = useCallback((v: string) => set({ search: v }), [set])
  const [search, setSearch] = useSearchBox(f.search, applySearch)

  const params = {
    search: f.search,
    status: f.status === 'active' ? ACTIVE.join(',') : f.status,
    payment_status: f.payment_status,
    payment_method: f.payment_method,
    fulfilment_type: f.fulfilment_type,
    date_from: f.date_from,
    date_to: f.date_to,
    sort: f.sort,
    customer_id: f.customer_id ? Number(f.customer_id) : undefined,
    page,
    per_page: 20,
  }
  const query = useQuery({ queryKey: ['orders', 'list', params], queryFn: () => orders.list(params), placeholderData: (prev) => prev, refetchInterval: 30_000 })
  const filtered = Boolean(f.search || f.status || f.payment_status || f.payment_method || f.fulfilment_type || f.date_from || f.date_to || f.customer_id)

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-2 border-b border-rule p-4">
        <SearchInput className="w-full sm:w-80" label="Search orders" placeholder="Order no., customer, email or phone" value={search} onChange={setSearch} />
        <FilterSelect label="Status" value={f.status} onChange={(e) => set({ status: e.target.value })} className="w-[calc(50%-0.25rem)] sm:w-auto sm:min-w-44">
          <option value="">All statuses</option>
          <option value="active">In the kitchen</option>
          {(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_LABEL[s]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Payment status" value={f.payment_status} onChange={(e) => set({ payment_status: e.target.value })} className="w-[calc(50%-0.25rem)] sm:w-auto sm:min-w-44">
          <option value="">Any payment</option>
          {(Object.keys(PAYMENT_STATUS_LABEL) as PaymentStatus[]).map((s) => (
            <option key={s} value={s}>
              {PAYMENT_STATUS_LABEL[s]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Payment method" value={f.payment_method} onChange={(e) => set({ payment_method: e.target.value })} className="w-[calc(50%-0.25rem)] sm:w-auto sm:min-w-40">
          <option value="">Any method</option>
          {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABEL[m]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Fulfilment" value={f.fulfilment_type} onChange={(e) => set({ fulfilment_type: e.target.value })} className="w-[calc(50%-0.25rem)] sm:w-auto sm:min-w-36">
          <option value="">Delivery or pickup</option>
          <option value="delivery">Delivery</option>
          <option value="pickup">Pickup</option>
        </FilterSelect>
        <div className="flex w-full items-center gap-2 sm:w-auto" role="group" aria-label="Placed between">
          <span className="shrink-0 text-[0.9375rem] text-dim">Placed</span>
          <TextField label="Placed from" hideLabel type="date" value={f.date_from} max={f.date_to || undefined} onChange={(e) => set({ date_from: e.target.value })} className="min-w-0 flex-1 sm:w-40 sm:flex-none" />
          <span className="text-[0.9375rem] text-dim">to</span>
          <TextField label="Placed until" hideLabel type="date" value={f.date_to} min={f.date_from || undefined} onChange={(e) => set({ date_to: e.target.value })} className="min-w-0 flex-1 sm:w-40 sm:flex-none" />
        </div>
        <FilterSelect label="Sort" value={f.sort} onChange={(e) => set({ sort: e.target.value })} className="w-full sm:w-auto sm:min-w-40">
          <option value="">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="-total">Highest total</option>
          <option value="total">Lowest total</option>
        </FilterSelect>
        {filtered && (
          <Button
            variant="ghost"
            size="md"
            onClick={() => {
              setSearch('')
              set({ search: null, status: null, payment_status: null, payment_method: null, fulfilment_type: null, date_from: null, date_to: null, customer_id: null })
            }}
          >
            Clear filters
          </Button>
        )}
      </div>
      {f.customer_id && <p className="border-b border-rule px-5 py-2.5 text-[0.9375rem] text-grey">Showing one customer’s orders.</p>}

      {query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
      ) : !query.data ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : query.data.data.length === 0 ? (
        <EmptyState icon={<ReceiptText className="h-5 w-5" />} title={filtered ? 'No orders match these filters' : 'No orders yet'}>
          {filtered ? 'Try a wider date range or clear the filters.' : 'Orders placed on the website will appear here.'}
        </EmptyState>
      ) : (
        <div className={cn('transition-opacity', query.isFetching && 'opacity-70')}>
          <Table label="Orders">
            <thead>
              <tr>
                <th className={th}>Order</th>
                <th className={th}>Customer</th>
                <th className={th}>Placed</th>
                <th className={th}>Products</th>
                <th className={cn(th, 'text-right')}>Total</th>
                <th className={th}>Payment</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {query.data.data.map((o) => (
                <tr key={o.order_number} className="cursor-pointer hover:bg-bone/[0.025]" onClick={() => set({ order: o.order_number, page })}>
                  <td className={td}>
                    <button
                      type="button"
                      className="whitespace-nowrap text-left font-semibold text-bone hover:text-ember-hot"
                      onClick={(e) => {
                        e.stopPropagation()
                        set({ order: o.order_number, page })
                      }}
                    >
                      {o.order_number}
                    </button>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-dim">
                      {o.fulfilment_type === 'delivery' ? <Truck className="h-3 w-3" aria-hidden="true" /> : <ShoppingBag className="h-3 w-3" aria-hidden="true" />}
                      {o.fulfilment_type === 'delivery' ? 'Delivery' : 'Pickup'}
                    </p>
                  </td>
                  <td className={td}>
                    <p className="text-bone">{o.customer.name}</p>
                    <p className="text-xs text-dim">{o.customer.phone}</p>
                  </td>
                  <td className={cn(td, 'tabular whitespace-nowrap text-grey')}>{dateTime(o.created_at)}</td>
                  <td className={cn(td, 'max-w-[16rem] text-grey')}>
                    <p className="truncate">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</p>
                  </td>
                  <td className={cn(td, 'tabular whitespace-nowrap text-right font-medium text-bone')}>{money(o.total)}</td>
                  <td className={td}>
                    <PaymentStatusBadge status={o.payment_status} />
                    <p className="mt-1 text-xs text-dim">{PAYMENT_METHOD_LABEL[o.payment_method]}</p>
                  </td>
                  <td className={td}>
                    <OrderStatusBadge status={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={query.data.meta.current_page} lastPage={query.data.meta.last_page} total={query.data.meta.total} from={query.data.meta.from} to={query.data.meta.to} onPage={(p) => set({ page: p })} noun="orders" />
        </div>
      )}
    </Card>
  )
}

// ── Kitchen board ─────────────────────────────────────────────────────────────

const COLUMNS: { status: OrderStatus; hint: string }[] = [
  { status: 'pending', hint: 'Accept or reject' },
  { status: 'confirmed', hint: 'Accepted, not started' },
  { status: 'preparing', hint: 'On the grill' },
  { status: 'ready', hint: 'On the pass' },
  { status: 'out_for_delivery', hint: 'With the rider' },
]

function KitchenBoard({ onOpen }: { onOpen: (orderNumber: string) => void }) {
  const query = useQuery({
    queryKey: ['orders', 'board'],
    queryFn: () => orders.list({ status: ACTIVE.join(','), sort: 'oldest', per_page: 100 }),
    refetchInterval: 15_000,
  })
  const now = useNow(30_000)
  const status = useOrderStatus()
  const [reasonFor, setReasonFor] = useState<{ order: Order; status: OrderStatus } | null>(null)

  if (query.isError) {
    return (
      <Card>
        <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
      </Card>
    )
  }

  const byStatus = (s: OrderStatus) => (query.data?.data ?? []).filter((o) => o.status === s)

  return (
    <>
      <div className="scrollbar-thin -mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        <div className="grid min-w-[62rem] grid-cols-5 gap-3">
          {COLUMNS.map(({ status: col, hint }) => {
            const items = byStatus(col)
            return (
              <section key={col} aria-label={`${ORDER_STATUS_LABEL[col]}: ${items.length} orders`} className="flex min-h-[60vh] flex-col rounded-2xl border border-rule bg-char/50">
                <header className="flex items-baseline justify-between gap-2 border-b border-rule px-4 py-3">
                  <div>
                    <h2 className="title text-xl text-bone">{ORDER_STATUS_LABEL[col]}</h2>
                    <p className="text-xs text-dim">{hint}</p>
                  </div>
                  <span className="tabular text-lg font-semibold text-grey">{query.data ? items.length : '–'}</span>
                </header>
                <div className="flex-1 space-y-3 p-3">
                  {!query.data ? (
                    <Skeleton className="h-36" />
                  ) : items.length === 0 ? (
                    <p className="px-1 py-6 text-center text-[0.9375rem] text-dim">Nothing here</p>
                  ) : (
                    items.map((o) => (
                      <Ticket
                        key={o.order_number}
                        order={o}
                        now={now}
                        onOpen={() => onOpen(o.order_number)}
                        busy={status.isPending && status.variables?.order.order_number === o.order_number}
                        onAdvance={(s) => status.mutate({ order: o, status: s })}
                        onVoid={(s) => setReasonFor({ order: o, status: s })}
                      />
                    ))
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </div>
      <ReasonModal
        key={reasonFor ? `${reasonFor.order.order_number}-${reasonFor.status}` : 'none'}
        target={reasonFor}
        onClose={() => setReasonFor(null)}
        pending={status.isPending}
        onSubmit={(note) => reasonFor && status.mutate({ ...reasonFor, note }, { onSuccess: () => setReasonFor(null) })}
      />
    </>
  )
}

function Ticket({ order: o, now, onOpen, onAdvance, onVoid, busy }: { order: Order; now: number; onOpen: () => void; onAdvance: (s: OrderStatus) => void; onVoid: (s: OrderStatus) => void; busy: boolean }) {
  const minutes = Math.max(0, Math.floor((now - new Date(o.created_at).getTime()) / 60_000))
  const urgency = minutes >= 25 ? 'late' : minutes >= 15 ? 'slow' : 'fresh'
  const next = o.next_statuses.find((s) => s !== 'cancelled' && s !== 'rejected')
  const voidStatus = o.next_statuses.includes('rejected') ? 'rejected' : o.next_statuses.includes('cancelled') ? 'cancelled' : null
  const awaitingPayHere = o.status === 'pending' && o.payment_method === 'payhere' && o.payment_status !== 'paid'

  return (
    <article className="ticket relative rounded-xl bg-[#f3ede4] pt-3 text-[#1b1510] shadow-[0_14px_30px_-18px_rgb(0_0_0/0.9)]" aria-label={`Order ${o.order_number}`}>
      <div className={cn('absolute inset-x-0 top-0 h-1', urgency === 'late' ? 'bg-bad' : urgency === 'slow' ? 'bg-warn' : 'bg-transparent')} aria-hidden="true" />
      <div className="px-3.5 pb-3">
        <div className="flex items-start justify-between gap-2">
          <button type="button" onClick={onOpen} className="title text-left text-[1.35rem] hover:text-ember">
            {o.order_number.split('-').slice(-1)[0]}
          </button>
          <span className={cn('tabular inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', urgency === 'late' ? 'bg-bad text-white' : urgency === 'slow' ? 'bg-warn text-[#1b1510]' : 'bg-[#1b1510]/8 text-[#1b1510]/70')}>
            <Clock className="h-3 w-3" aria-hidden="true" />
            {minutes} min
            <span className="sr-only">{urgency === 'late' ? ', running late' : urgency === 'slow' ? ', getting slow' : ''}</span>
          </span>
        </div>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[#1b1510]/65">
          {o.fulfilment_type === 'delivery' ? <Truck className="h-3 w-3" aria-hidden="true" /> : <ShoppingBag className="h-3 w-3" aria-hidden="true" />}
          {o.fulfilment_type === 'delivery' ? 'Delivery' : 'Pickup'} for {o.customer.name.split(' ')[0]}
        </p>
        <ul className="mt-2.5 space-y-1 border-y border-dashed border-[#1b1510]/20 py-2.5 text-sm">
          {o.items.map((it, i) => (
            <li key={i} className="flex gap-2">
              <span className="tabular w-6 shrink-0 font-bold">{it.quantity}×</span>
              <span className="min-w-0">{it.name}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 flex items-center justify-between gap-2 text-xs text-[#1b1510]/70">
          <span className="inline-flex items-center gap-1">
            <CreditCard className="h-3 w-3" aria-hidden="true" />
            {o.payment_method === 'cod' ? 'Cash' : o.payment_status === 'paid' ? 'Paid online' : 'Awaiting PayHere'}
          </span>
          <span className="tabular font-semibold text-[#1b1510]">{money(o.total)}</span>
        </p>
        <div className="mt-3 flex gap-1.5">
          {next && (
            <button
              type="button"
              disabled={busy || (next === 'confirmed' && awaitingPayHere)}
              onClick={() => onAdvance(next)}
              className="h-8 flex-1 whitespace-nowrap rounded-lg bg-[#1b1510] px-2 text-[0.9375rem] font-semibold text-[#f3ede4] transition-colors hover:bg-ember hover:text-ember-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? 'Saving…' : ORDER_STATUS_ACTION[next]}
            </button>
          )}
          {voidStatus && (
            <button type="button" onClick={() => onVoid(voidStatus)} className="h-8 rounded-lg px-2.5 text-[0.9375rem] font-medium text-[#a3261f] hover:bg-[#a3261f]/10">
              {voidStatus === 'rejected' ? 'Reject' : 'Cancel'}
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
