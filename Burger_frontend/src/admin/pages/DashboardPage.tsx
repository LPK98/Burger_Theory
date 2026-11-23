import { useQuery } from '@tanstack/react-query'
import { Boxes, CircleUserRound, ReceiptText, ShoppingBag, UserPlus, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { cn } from '../../lib/utils'
import { ChartPanel } from '../components/ChartPanel'
import { AreaChart, BarList, ColumnChart, SeriesTable, type Point } from '../components/charts'
import { OrderStatusBadge, PaymentStatusBadge } from '../components/status'
import { Card, CardHeader, EmptyState, ErrorState, Segmented, Skeleton, Table, td, th } from '../components/ui'
import { PageHeader } from '../layout'
import { errorMessage } from '../lib/api'
import { dashboard, products, reports } from '../lib/endpoints'
import { ago, count, countCompact, money, moneyCompact, moneyWhole, ORDER_STATUS_LABEL, periodLabel, quantity, time } from '../lib/format'
import type { DashboardSummary, Interval, OrderStatus } from '../lib/types'

const PERIODS: { value: Interval; label: string; description: string }[] = [
  { value: 'day', label: 'Daily', description: 'last 30 days' },
  { value: 'week', label: 'Weekly', description: 'last 12 weeks' },
  { value: 'month', label: 'Monthly', description: 'last 12 months' },
]

const PASS: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery']
const LIFECYCLE: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'rejected']

export default function DashboardPage() {
  const [interval, setChartInterval] = useState<Interval>('day')
  const summary = useQuery({ queryKey: ['dashboard'], queryFn: dashboard.summary, refetchInterval: 60_000 })
  const sales = useQuery({ queryKey: ['reports', 'sales', interval], queryFn: () => reports.sales({ interval }), placeholderData: (prev) => prev })
  const menu = useQuery({ queryKey: ['products', 'all-for-images'], queryFn: () => products.list({ per_page: 100 }), staleTime: 300_000 })

  const period = PERIODS.find((p) => p.value === interval)!
  const revenuePoints: Point[] = useMemo(
    () =>
      (sales.data?.series ?? []).map((s) => ({
        key: s.period,
        label: periodLabel(s.period, interval),
        longLabel: periodLabel(s.period, interval, true),
        value: s.revenue,
        extra: [{ label: 'Paid orders', value: count(s.orders) }],
      })),
    [sales.data, interval],
  )
  const orderPoints: Point[] = useMemo(
    () =>
      (sales.data?.series ?? []).map((s) => ({
        key: s.period,
        label: periodLabel(s.period, interval),
        longLabel: periodLabel(s.period, interval, true),
        value: s.placed,
        extra: [{ label: 'Cancelled or rejected', value: count(s.cancelled) }],
      })),
    [sales.data, interval],
  )

  if (summary.isError) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <Card>
          <ErrorState message={errorMessage(summary.error)} onRetry={() => summary.refetch()} />
        </Card>
      </>
    )
  }

  const s = summary.data
  const imageBySlug = new Map((menu.data?.data ?? []).map((p) => [p.slug, p.image?.url ?? null]))

  return (
    <>
      <PageHeader title="Dashboard" description="Revenue counts paid orders only: PayHere payments verified by the server, and cash recorded as collected." />

      {/* Headline figures */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-[1.6fr_repeat(5,1fr)]">
        <Card className="col-span-2 p-5 md:col-span-3 xl:col-span-1">
          <p className="text-[0.8125rem] text-grey">Today’s revenue</p>
          {s ? (
            <>
              <p className="mt-2 text-[2.75rem] font-semibold leading-none tracking-tight text-bone sm:text-5xl">{moneyWhole(s.today.revenue)}</p>
              <p className="mt-3 text-[0.8125rem] text-dim">
                {count(s.today.paid_orders)} paid of {count(s.today.orders_placed)} placed today
              </p>
            </>
          ) : (
            <Skeleton className="mt-3 h-12 w-48" />
          )}
        </Card>
        <Stat label="Total revenue" value={s && moneyCompact(s.total_revenue)} sub={s && `${count(s.paid_orders)} paid orders`} />
        <Stat label="Total orders" value={s && countCompact(s.total_orders)} sub={s && `${count(s.active_orders)} in the kitchen`} />
        <Stat
          label="Pending orders"
          value={s && count(s.pending_orders)}
          sub={s && (s.pending_orders > 0 ? 'Waiting to be accepted' : 'Nothing waiting')}
          to={s && s.pending_orders > 0 ? '/orders?status=pending' : undefined}
          alert={!!s && s.pending_orders > 0}
        />
        <Stat label="Completed orders" value={s && countCompact(s.completed_orders)} sub={s && `${count(s.cancelled_orders)} cancelled or rejected`} />
        <Stat label="Total customers" value={s && countCompact(s.total_customers)} sub={s && `${count(s.new_customers_today)} joined today`} />
      </div>

      {/* On the pass right now */}
      <OnThePass summary={s} />

      {/* Period filter scopes the two time charts below it. */}
      <div className="mb-3 mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[0.9375rem] font-semibold text-bone">Trends</h2>
        <Segmented label="Chart period" value={interval} onChange={setChartInterval} options={PERIODS.map(({ value, label }) => ({ value, label }))} />
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <ChartPanel
          className="xl:col-span-2"
          title="Revenue overview"
          description={`Paid revenue, ${period.description}`}
          figure={sales.data && <p className="text-2xl font-semibold text-bone">{moneyWhole(sales.data.totals.revenue)}</p>}
          loading={!sales.data}
          error={sales.isError ? errorMessage(sales.error) : null}
          onRetry={() => sales.refetch()}
          chart={<AreaChart points={revenuePoints} label={`Revenue per ${interval}, ${period.description}`} valueName="Revenue" formatValue={money} formatAxis={moneyCompact} stale={sales.isFetching} />}
          table={<SeriesTable points={revenuePoints} valueName="Revenue" formatValue={money} caption="Revenue overview" />}
        />
        <Card aria-labelledby="status-dist">
          <CardHeader id="status-dist" title="Order status distribution" description="Every order, by where it is now" />
          <div className="px-5 pb-5 pt-4">
            {s ? (
              <BarList
                label="Orders by status"
                rows={LIFECYCLE.map((st) => ({ key: st, label: ORDER_STATUS_LABEL[st], value: s.orders_by_status[st] ?? 0 }))}
                formatValue={count}
              />
            ) : (
              <Skeleton className="h-64" />
            )}
          </div>
        </Card>

        <ChartPanel
          className="xl:col-span-2"
          title="Orders overview"
          description={`Orders placed, ${period.description}`}
          figure={
            sales.data && (
              <p className="text-2xl font-semibold text-bone">
                {count(sales.data.totals.placed)} <span className="text-sm font-normal text-dim">placed, {count(sales.data.totals.cancelled)} cancelled or rejected</span>
              </p>
            )
          }
          loading={!sales.data}
          error={sales.isError ? errorMessage(sales.error) : null}
          onRetry={() => sales.refetch()}
          chart={<ColumnChart points={orderPoints} label={`Orders placed per ${interval}, ${period.description}`} valueName="Orders" formatValue={count} formatAxis={countCompact} stale={sales.isFetching} />}
          table={<SeriesTable points={orderPoints} valueName="Orders placed" formatValue={count} caption="Orders overview" />}
        />
        <Card aria-labelledby="best-sellers">
          <CardHeader id="best-sellers" title="Best-selling products" description="Burgers sold in paid orders, all time" />
          <div className="px-5 pb-5 pt-4">
            {s ? (
              <BarList
                label="Best sellers by quantity"
                rows={s.best_sellers.map((b) => ({ key: String(b.product_id ?? b.name), label: b.name, value: b.quantity_sold, sub: moneyCompact(b.revenue) }))}
                formatValue={count}
                emptyText="No paid orders yet."
              />
            ) : (
              <Skeleton className="h-56" />
            )}
          </div>
        </Card>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        <RecentOrders summary={s} className="xl:col-span-2" />
        <LowStock summary={s} />
      </div>

      <div className="mt-3 grid items-start gap-3 xl:grid-cols-3">
        <TopBurgers summary={s} images={imageBySlug} className="xl:col-span-2" />
        <Activity summary={s} />
      </div>
    </>
  )
}

function Stat({ label, value, sub, to, alert }: { label: string; value?: string | false; sub?: string | false; to?: string; alert?: boolean }) {
  const body = (
    <>
      <p className="flex items-center gap-2 text-[0.8125rem] text-grey">
        {alert && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warn" aria-hidden="true" />}
        {label}
      </p>
      {value ? <p className="mt-2 text-[1.75rem] font-semibold leading-none tracking-tight text-bone">{value}</p> : <Skeleton className="mt-2 h-7 w-20" />}
      {sub && <p className="mt-2.5 text-xs text-dim">{sub}</p>}
    </>
  )
  return to ? (
    <Link to={to} className="glass block rounded-2xl p-5 transition-colors hover:border-warn/40">
      {body}
    </Link>
  ) : (
    <Card className="p-5">{body}</Card>
  )
}

function OnThePass({ summary }: { summary?: DashboardSummary }) {
  return (
    <Card className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4" aria-label="Orders on the pass">
      <p className="text-sm font-semibold text-bone">On the pass</p>
      <ol className="flex flex-1 flex-wrap items-center gap-x-1 gap-y-2">
        {PASS.map((st, i) => (
          <li key={st} className="flex items-center gap-1">
            <Link to={`/orders?view=board`} className="flex items-baseline gap-2 rounded-lg px-2.5 py-1.5 hover:bg-smoke">
              <span className={cn('tabular text-lg font-semibold', (summary?.orders_by_status[st] ?? 0) > 0 ? 'text-bone' : 'text-dim')}>{summary ? count(summary.orders_by_status[st] ?? 0) : '–'}</span>
              <span className="text-[0.8125rem] text-grey">{ORDER_STATUS_LABEL[st]}</span>
            </Link>
            {i < PASS.length - 1 && <span className="h-px w-4 bg-rule-strong" aria-hidden="true" />}
          </li>
        ))}
      </ol>
      <Link to="/orders?view=board" className="text-[0.8125rem] font-medium text-ember-hot hover:underline">
        Open the kitchen board
      </Link>
    </Card>
  )
}

function RecentOrders({ summary, className }: { summary?: DashboardSummary; className?: string }) {
  return (
    <Card className={className} aria-labelledby="recent-orders">
      <CardHeader id="recent-orders" title="Recent orders" action={<Link to="/orders" className="text-[0.8125rem] font-medium text-ember-hot hover:underline">All orders</Link>} />
      <div className="pt-3">
        {!summary ? (
          <div className="space-y-2 px-5 pb-5">
            {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-9" />)}
          </div>
        ) : summary.recent_orders.length === 0 ? (
          <EmptyState icon={<ReceiptText className="h-5 w-5" />} title="No orders yet">Orders placed on the website appear here.</EmptyState>
        ) : (
          <Table label="Recent orders">
            <thead>
              <tr>
                <th className={th}>Order</th>
                <th className={th}>Customer</th>
                <th className={th}>Placed</th>
                <th className={cn(th, 'text-right')}>Total</th>
                <th className={th}>Payment</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {summary.recent_orders.slice(0, 8).map((o) => (
                <tr key={o.order_number} className="hover:bg-bone/[0.02]">
                  <td className={td}>
                    <Link to={`/orders?order=${encodeURIComponent(o.order_number)}`} className="whitespace-nowrap font-medium text-bone hover:text-ember-hot">
                      {o.order_number}
                    </Link>
                  </td>
                  <td className={cn(td, 'text-grey')}>{o.customer.name}</td>
                  <td className={cn(td, 'tabular text-grey')}>{time(o.created_at)}</td>
                  <td className={cn(td, 'tabular text-right text-bone')}>{money(o.total)}</td>
                  <td className={td}>
                    <PaymentStatusBadge status={o.payment_status} />
                  </td>
                  <td className={td}>
                    <OrderStatusBadge status={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </Card>
  )
}

function LowStock({ summary }: { summary?: DashboardSummary }) {
  return (
    <Card aria-labelledby="low-stock">
      <CardHeader id="low-stock" title="Low-stock ingredients" description="At or below their minimum level" action={<Link to="/inventory?status=low" className="text-[0.8125rem] font-medium text-ember-hot hover:underline">Inventory</Link>} />
      <div className="px-5 pb-5 pt-4">
        {!summary ? (
          <Skeleton className="h-48" />
        ) : summary.low_stock_ingredients.length === 0 ? (
          <EmptyState icon={<Boxes className="h-5 w-5" />} title="Everything is stocked">No ingredient is at or below its minimum level.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {summary.low_stock_ingredients.map((i) => {
              const ratio = i.min_stock_level > 0 ? Math.max(0, Math.min(1, i.stock_quantity / i.min_stock_level)) : 0
              const empty = i.stock_quantity <= 0
              return (
                <li key={i.id}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate text-bone/90">{i.name}</span>
                    <span className={cn('tabular shrink-0', empty ? 'text-[#ff8a83]' : 'text-warn')}>
                      {quantity(i.stock_quantity, i.unit)} <span className="text-dim">/ {quantity(i.min_stock_level)}</span>
                    </span>
                  </div>
                  {/* Meter: fill shows stock against the minimum; the track is the same hue, lighter. */}
                  <div className={cn('mt-1.5 h-1.5 rounded-full', empty ? 'bg-bad/20' : 'bg-warn/20')} aria-hidden="true">
                    <div className={cn('h-1.5 rounded-full', empty ? 'bg-bad' : 'bg-warn')} style={{ width: `${Math.max(3, ratio * 100)}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Card>
  )
}

function TopBurgers({ summary, images, className }: { summary?: DashboardSummary; images: Map<string, string | null>; className?: string }) {
  const top = summary?.best_sellers.slice(0, 3) ?? []
  return (
    <Card className={className} aria-labelledby="top-burgers">
      <CardHeader id="top-burgers" title="Top-selling burgers" description="By burgers sold in paid orders" />
      <div className="grid gap-3 px-5 pb-5 pt-4 sm:grid-cols-3">
        {!summary ? (
          Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-44" />)
        ) : top.length === 0 ? (
          <p className="text-sm text-dim sm:col-span-3">No paid orders yet.</p>
        ) : (
          top.map((b, i) => {
            const img = b.slug ? images.get(b.slug) : null
            return (
              <div key={b.name} className="relative overflow-hidden rounded-xl border border-rule bg-pitch/50 p-4">
                <span className="title absolute right-3 top-2 text-5xl text-bone/10" aria-hidden="true">
                  {i + 1}
                </span>
                <div className="mb-3 grid h-24 place-items-center">
                  {img ? <img src={img} alt="" className="h-24 w-auto object-contain drop-shadow-[0_12px_20px_rgb(0_0_0/0.6)]" /> : <ShoppingBag className="h-10 w-10 text-dim" aria-hidden="true" />}
                </div>
                <p className="truncate font-semibold text-bone">
                  <span className="sr-only">Number {i + 1}: </span>
                  {b.name}
                </p>
                <p className="mt-1 text-[0.8125rem] text-grey">
                  {count(b.quantity_sold)} sold, {moneyCompact(b.revenue)}
                </p>
              </div>
            )
          })
        )}
      </div>
    </Card>
  )
}

const ACTIVITY = {
  signed_up: { icon: UserPlus, text: 'created an account' },
  placed_order: { icon: CircleUserRound, text: 'placed' },
  cancelled_order: { icon: XCircle, text: 'cancelled' },
}

function Activity({ summary }: { summary?: DashboardSummary }) {
  return (
    <Card aria-labelledby="activity">
      <CardHeader id="activity" title="Recent customer activity" />
      <div className="px-5 pb-5 pt-4">
        {!summary ? (
          <Skeleton className="h-56" />
        ) : summary.recent_activity.length === 0 ? (
          <p className="text-sm text-dim">No customer activity yet.</p>
        ) : (
          <ol className="space-y-3.5">
            {summary.recent_activity.slice(0, 8).map((a, i) => {
              const { icon: Icon, text } = ACTIVITY[a.type]
              return (
                <li key={`${a.type}-${a.order_number ?? a.customer_id}-${i}`} className="flex gap-3">
                  <span className={cn('mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full', a.type === 'cancelled_order' ? 'bg-bad/12 text-[#ff8a83]' : a.type === 'signed_up' ? 'bg-info/12 text-[#93bdf5]' : 'bg-ember/12 text-ember-hot')}>
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 text-sm">
                    <p className="text-grey">
                      <Link to={`/customers?customer=${a.customer_id}`} className="font-medium text-bone hover:text-ember-hot">
                        {a.customer_name}
                      </Link>{' '}
                      {text}
                      {a.order_number && (
                        <>
                          {' '}
                          <Link to={`/orders?order=${encodeURIComponent(a.order_number)}`} className="text-bone/90 hover:text-ember-hot">
                            {a.order_number}
                          </Link>
                          {a.amount != null && <span className="tabular"> for {moneyWhole(a.amount)}</span>}
                        </>
                      )}
                    </p>
                    <p className="text-xs text-dim">{ago(a.at)}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </Card>
  )
}
