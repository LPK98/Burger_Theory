import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { useMemo } from 'react'
import { ChartPanel } from '../components/ChartPanel'
import { AreaChart, BarList, ColumnChart, SeriesTable, type Point } from '../components/charts'
import { Button, Card, CardHeader, ErrorState, Segmented, Skeleton, TextField } from '../components/ui'
import { PageHeader } from '../layout'
import { errorMessage } from '../lib/api'
import { reports } from '../lib/endpoints'
import { count, countCompact, money, moneyCompact, moneyWhole, ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL, percent, periodLabel, todayLocal } from '../lib/format'
import { useUrlFilters } from '../lib/hooks'
import type { Interval, OrderStatus, PaymentMethod } from '../lib/types'

const PRESETS = [
  { key: '7', label: '7 days', days: 7 },
  { key: '30', label: '30 days', days: 30 },
  { key: '90', label: '90 days', days: 90 },
  { key: '365', label: '12 months', days: 365 },
] as const

const FILTERS = ['range', 'from', 'to', 'interval'] as const

export default function ReportsPage() {
  const { values: f, set } = useUrlFilters(FILTERS)
  const preset = PRESETS.find((p) => p.key === (f.range || (f.from || f.to ? '' : '30')))
  const to = preset ? todayLocal() : f.to || todayLocal()
  const from = preset ? todayLocal(-(preset.days - 1)) : f.from || todayLocal(-29)
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1
  const interval: Interval = (f.interval as Interval) || (days > 120 ? 'month' : days > 45 ? 'week' : 'day')

  const sales = useQuery({ queryKey: ['reports', 'sales', interval, from, to], queryFn: () => reports.sales({ interval, from, to }), placeholderData: (prev) => prev })
  const stats = useQuery({ queryKey: ['reports', 'orders', from, to], queryFn: () => reports.orders({ from, to }), placeholderData: (prev) => prev })
  const best = useQuery({ queryKey: ['reports', 'best', from, to], queryFn: () => reports.bestSellers({ from, to, limit: 10 }), placeholderData: (prev) => prev })

  const revenuePoints: Point[] = useMemo(
    () =>
      (sales.data?.series ?? []).map((s) => ({
        key: s.period,
        label: periodLabel(s.period, interval),
        longLabel: periodLabel(s.period, interval, true),
        value: s.revenue,
        extra: [
          { label: 'Paid orders', value: count(s.orders) },
          { label: 'Discounts', value: money(s.discounts) },
        ],
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
  const hourPoints: Point[] = useMemo(
    () =>
      (stats.data?.by_hour ?? []).map((h) => ({
        key: String(h.hour),
        label: `${String(h.hour).padStart(2, '0')}`,
        longLabel: `${String(h.hour).padStart(2, '0')}:00 to ${String(h.hour).padStart(2, '0')}:59`,
        value: h.orders,
      })),
    [stats.data],
  )

  const exportCsv = () => {
    if (!sales.data) return
    const rows = [['period', 'paid_orders', 'revenue_lkr', 'discounts_lkr', 'orders_placed', 'cancelled_or_rejected'], ...sales.data.series.map((s) => [s.period, s.orders, (s.revenue / 100).toFixed(2), (s.discounts / 100).toFixed(2), s.placed, s.cancelled])]
    const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = Object.assign(document.createElement('a'), { href: url, download: `burger-theory-sales-${interval}-${from}-to-${to}.csv` })
    a.click()
    URL.revokeObjectURL(url)
  }

  const s = stats.data
  const stale = sales.isFetching || stats.isFetching

  return (
    <>
      <PageHeader
        title="Reports"
        description="Sales, revenue and order statistics. Revenue counts paid orders by payment date; order counts use the date the order was placed."
        actions={
          <Button icon={<Download className="h-4 w-4" aria-hidden="true" />} onClick={exportCsv} disabled={!sales.data}>
            Export CSV
          </Button>
        }
      />

      {/* One filter row scopes every figure on the page. */}
      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <div>
          <p className="mb-1.5 text-[0.8125rem] font-medium text-bone/85">Period</p>
          <Segmented
            label="Report period"
            value={preset?.key ?? 'custom'}
            onChange={(k) => set(k === 'custom' ? { range: 'custom', from, to } : { range: k === '30' ? null : k, from: null, to: null })}
            options={[...PRESETS.map((p) => ({ value: p.key as string, label: p.label })), { value: 'custom', label: 'Custom' }]}
          />
        </div>
        {!preset && (
          <>
            <TextField label="From" type="date" value={from} max={to} onChange={(e) => set({ range: 'custom', from: e.target.value })} className="w-40" />
            <TextField label="To" type="date" value={to} min={from} max={todayLocal()} onChange={(e) => set({ range: 'custom', to: e.target.value })} className="w-40" />
          </>
        )}
        <div>
          <p className="mb-1.5 text-[0.8125rem] font-medium text-bone/85">Group by</p>
          <Segmented
            label="Group by"
            value={interval}
            onChange={(v) => set({ interval: v })}
            options={[
              { value: 'day', label: 'Day' },
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
            ]}
          />
        </div>
        <p className="ml-auto pb-2 text-[0.8125rem] text-dim">
          {from} to {to}, Sri Lanka time
        </p>
      </Card>

      {stats.isError ? (
        <Card className="mb-4">
          <ErrorState message={errorMessage(stats.error)} onRetry={() => stats.refetch()} />
        </Card>
      ) : (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          {[
            { label: 'Revenue', value: s && moneyWhole(s.revenue) },
            { label: 'Paid orders', value: s && count(s.paid_orders) },
            { label: 'Average order', value: s && moneyWhole(s.average_order_value) },
            { label: 'Orders placed', value: s && count(s.orders_placed) },
            { label: 'Cancellation rate', value: s && percent(s.cancellation_rate) },
            { label: 'Discounts given', value: s && moneyWhole(s.discounts) },
            { label: 'Delivery fees', value: s && moneyWhole(s.delivery_fees) },
          ].map((t) => (
            <Card key={t.label} className={`p-4 transition-opacity ${stale ? 'opacity-70' : ''}`}>
              <p className="text-[0.8125rem] text-grey">{t.label}</p>
              {t.value ? <p className="mt-1.5 text-xl font-semibold text-bone">{t.value}</p> : <Skeleton className="mt-2 h-6 w-20" />}
            </Card>
          ))}
        </div>
      )}

      <div className="grid items-start gap-3 xl:grid-cols-2">
        <ChartPanel
          title="Revenue"
          description={`Paid revenue per ${interval}`}
          loading={!sales.data}
          error={sales.isError ? errorMessage(sales.error) : null}
          onRetry={() => sales.refetch()}
          chart={<AreaChart points={revenuePoints} label={`Revenue per ${interval} from ${from} to ${to}`} valueName="Revenue" formatValue={money} formatAxis={moneyCompact} stale={sales.isFetching} />}
          table={<SeriesTable points={revenuePoints} valueName="Revenue" formatValue={money} caption="Revenue report" />}
        />
        <ChartPanel
          title="Orders placed"
          description={`Every order placed, per ${interval}`}
          loading={!sales.data}
          error={sales.isError ? errorMessage(sales.error) : null}
          onRetry={() => sales.refetch()}
          chart={<ColumnChart points={orderPoints} label={`Orders placed per ${interval} from ${from} to ${to}`} valueName="Orders" formatValue={count} formatAxis={countCompact} stale={sales.isFetching} />}
          table={<SeriesTable points={orderPoints} valueName="Orders placed" formatValue={count} caption="Orders report" />}
        />
        <ChartPanel
          title="Busiest hours"
          description="Orders placed by hour of the day"
          loading={!stats.data}
          error={stats.isError ? errorMessage(stats.error) : null}
          onRetry={() => stats.refetch()}
          chart={<ColumnChart points={hourPoints} label={`Orders by hour of day from ${from} to ${to}`} valueName="Orders" formatValue={count} formatAxis={countCompact} stale={stats.isFetching} />}
          table={<SeriesTable points={hourPoints} valueName="Orders" formatValue={count} caption="Orders by hour" />}
        />
        <Card aria-labelledby="report-best">
          <CardHeader id="report-best" title="Best-selling products" description="Burgers sold in paid orders, with revenue" />
          <div className="px-5 pb-5 pt-4">
            {best.isError ? (
              <ErrorState message={errorMessage(best.error)} onRetry={() => best.refetch()} />
            ) : !best.data ? (
              <Skeleton className="h-64" />
            ) : (
              <BarList label="Best sellers" rows={best.data.map((b) => ({ key: b.name, label: b.name, value: b.quantity_sold, sub: moneyCompact(b.revenue) }))} formatValue={count} emptyText="No paid orders in this period." />
            )}
          </div>
        </Card>
      </div>

      <div className="mt-3 grid items-start gap-3 lg:grid-cols-3">
        <Card aria-labelledby="report-status">
          <CardHeader id="report-status" title="Orders by status" description="Where this period’s orders ended up" />
          <div className="px-5 pb-5 pt-4">
            {s ? (
              <BarList label="Orders by status" rows={(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((st) => ({ key: st, label: ORDER_STATUS_LABEL[st], value: s.by_status[st] ?? 0 }))} formatValue={count} />
            ) : (
              <Skeleton className="h-56" />
            )}
          </div>
        </Card>
        <Card aria-labelledby="report-fulfilment">
          <CardHeader id="report-fulfilment" title="Delivery or pickup" />
          <div className="px-5 pb-5 pt-4">
            {s ? (
              <BarList
                label="Orders by fulfilment"
                rows={[
                  { key: 'delivery', label: 'Delivery', value: s.by_fulfilment.delivery ?? 0 },
                  { key: 'pickup', label: 'Pickup', value: s.by_fulfilment.pickup ?? 0 },
                ]}
                formatValue={count}
              />
            ) : (
              <Skeleton className="h-24" />
            )}
          </div>
        </Card>
        <Card aria-labelledby="report-method">
          <CardHeader id="report-method" title="Payment method" />
          <div className="px-5 pb-5 pt-4">
            {s ? (
              <BarList
                label="Orders by payment method"
                rows={(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => ({ key: m, label: PAYMENT_METHOD_LABEL[m], value: s.by_payment_method[m] ?? 0 }))}
                formatValue={count}
              />
            ) : (
              <Skeleton className="h-24" />
            )}
          </div>
        </Card>
      </div>
    </>
  )
}
