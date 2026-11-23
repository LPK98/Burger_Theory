import { useQuery } from '@tanstack/react-query'
import { CreditCard, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useCallback, type ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '../../lib/utils'
import { Drawer } from '../components/overlay'
import { OrderStatusBadge, PaymentStatusBadge } from '../components/status'
import { Card, EmptyState, ErrorState, FilterSelect, Pagination, SearchInput, Skeleton, Table, TextField, td, th } from '../components/ui'
import { PageHeader } from '../layout'
import { errorMessage } from '../lib/api'
import { payments } from '../lib/endpoints'
import { count, dateTime, money, moneyWhole, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from '../lib/format'
import { useSearchBox, useUrlFilters } from '../lib/hooks'
import type { PaymentMethod, PaymentStatus } from '../lib/types'

const FILTERS = ['payment', 'search', 'method', 'status', 'date_from', 'date_to'] as const

/** Who confirms a payment of each method. */
const PROVIDER: Record<PaymentMethod, string> = { stripe: 'Stripe', payhere: 'PayHere', cod: 'Staff' }

export default function PaymentsPage() {
  const { values: f, set, page } = useUrlFilters(FILTERS)
  const applySearch = useCallback((v: string) => set({ search: v }), [set])
  const [search, setSearch] = useSearchBox(f.search, applySearch)
  const params = { search: f.search, method: f.method, status: f.status, date_from: f.date_from, date_to: f.date_to, page, per_page: 20 }
  const list = useQuery({ queryKey: ['payments', params], queryFn: () => payments.list(params), placeholderData: (prev) => prev, refetchInterval: 30_000 })
  const s = list.data?.meta.summary
  const filtered = Boolean(f.search || f.method || f.status || f.date_from || f.date_to)

  return (
    <>
      <PageHeader title="Payments" description="Every Stripe, PayHere and cash-on-delivery payment. Online payments count as paid only after the server verifies them with the payment provider." />

      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Paid', value: s && moneyWhole(s.paid_amount), sub: s && `${count(s.paid)} payments` },
          { label: 'Awaiting payment', value: s && moneyWhole(s.pending_amount), sub: s && `${count(s.pending)} payments` },
          { label: 'Failed or cancelled', value: s && count(s.failed), sub: 'Customers can retry online payment' },
          { label: 'Needs attention', value: s && count(s.needs_attention), sub: 'Refunds owed or chargebacks', alert: !!s && s.needs_attention > 0 },
        ].map((t) => (
          <Card key={t.label} className={cn('p-5', t.alert && 'border-serious/40')}>
            <p className="text-[0.9375rem] text-grey">{t.label}</p>
            {t.value ? <p className="mt-2 text-2xl font-semibold text-bone">{t.value}</p> : <Skeleton className="mt-2 h-7 w-24" />}
            <p className="mt-1.5 text-xs text-dim">{t.sub}</p>
          </Card>
        ))}
      </div>
      {filtered && <p className="-mt-1 mb-3 text-xs text-dim">Totals reflect the filters below.</p>}

      <Card>
        <div className="flex flex-wrap items-end gap-2 border-b border-rule p-4">
          <SearchInput className="w-full sm:w-72" label="Search payments" placeholder="Reference, order, customer or provider ID" value={search} onChange={setSearch} />
          <FilterSelect label="Method" value={f.method} onChange={(e) => set({ method: e.target.value })} className="w-[calc(50%-0.25rem)] sm:w-44">
            <option value="">Any method</option>
            {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABEL[m]}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Status" value={f.status} onChange={(e) => set({ status: e.target.value })} className="w-[calc(50%-0.25rem)] sm:w-44">
            <option value="">Any status</option>
            {(Object.keys(PAYMENT_STATUS_LABEL) as PaymentStatus[]).map((st) => (
              <option key={st} value={st}>
                {PAYMENT_STATUS_LABEL[st]}
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
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : list.data.data.length === 0 ? (
          <EmptyState icon={<CreditCard className="h-5 w-5" />} title={filtered ? 'No payments match' : 'No payments yet'}>
            {filtered ? 'Try a wider date range or clear the filters.' : 'A payment is created with every order.'}
          </EmptyState>
        ) : (
          <div className={cn('transition-opacity', list.isFetching && 'opacity-70')}>
            <Table label="Payments">
              <thead>
                <tr>
                  <th className={th}>Reference</th>
                  <th className={th}>Order</th>
                  <th className={th}>Method</th>
                  <th className={cn(th, 'text-right')}>Amount</th>
                  <th className={th}>Status</th>
                  <th className={th}>Created</th>
                </tr>
              </thead>
              <tbody>
                {list.data.data.map((p) => (
                  <tr key={p.reference} className="cursor-pointer hover:bg-bone/[0.025]" onClick={() => set({ payment: p.reference, page })}>
                    <td className={td}>
                      <button
                        type="button"
                        className="font-medium text-bone hover:text-ember-hot"
                        onClick={(e) => {
                          e.stopPropagation()
                          set({ payment: p.reference, page })
                        }}
                      >
                        {p.reference}
                      </button>
                      {p.provider_payment_id && <p className="text-xs text-dim">{PROVIDER[p.method]} {p.provider_payment_id}</p>}
                    </td>
                    <td className={td}>
                      <p className="text-bone">{p.order?.order_number}</p>
                      <p className="text-xs text-dim">{p.order?.customer_name}</p>
                    </td>
                    <td className={cn(td, 'text-grey')}>
                      {PAYMENT_METHOD_LABEL[p.method]}
                      {p.provider_method && <span className="block text-xs text-dim">{p.provider_method}{p.card_mask ? ` •••• ${p.card_mask.slice(-4)}` : ''}</span>}
                    </td>
                    <td className={cn(td, 'tabular text-right font-medium text-bone')}>{money(p.amount)}</td>
                    <td className={td}>
                      <PaymentStatusBadge status={p.status} />
                    </td>
                    <td className={cn(td, 'tabular whitespace-nowrap text-grey')}>{dateTime(p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={list.data.meta.current_page} lastPage={list.data.meta.last_page} total={list.data.meta.total} from={list.data.meta.from} to={list.data.meta.to} onPage={(p) => set({ page: p })} noun="payments" />
          </div>
        )}
      </Card>
      <PaymentDrawer reference={f.payment || null} onClose={() => set({ payment: null, page })} />
    </>
  )
}

function PaymentDrawer({ reference, onClose }: { reference: string | null; onClose: () => void }) {
  const query = useQuery({ queryKey: ['payment', reference], queryFn: () => payments.get(reference!), enabled: reference !== null })
  const p = query.data
  const rows: [string, ReactNode][] = p
    ? [
        ['Amount', <span key="amount" className="tabular">{money(p.amount)}</span>],
        ['Method', `${PAYMENT_METHOD_LABEL[p.method]}${p.provider_method ? `, ${p.provider_method}` : ''}${p.card_mask ? ` •••• ${p.card_mask.slice(-4)}` : ''}`],
        ...(p.method === 'cod'
          ? []
          : ([
              [p.method === 'stripe' ? 'Stripe PaymentIntent' : 'PayHere payment ID', p.provider_payment_id ?? '—'],
              [`${PROVIDER[p.method]} status`, p.status_message ?? (p.provider_status_code !== null ? `Code ${p.provider_status_code}` : '—')],
            ] as [string, string][])),
        ['Created', dateTime(p.created_at)],
        ['Paid', p.paid_at ? dateTime(p.paid_at) : '—'],
        ...(p.method === 'cod' ? ([['Cash collected', p.collected_at ? `${dateTime(p.collected_at)}${p.collected_by ? ` by ${p.collected_by}` : ''}` : 'Not yet']] as [string, string][]) : []),
      ]
    : []

  return (
    <Drawer open={reference !== null} onClose={onClose} title={reference ?? ''} description={p && <PaymentStatusBadge status={p.status} />}>
      {query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
      ) : !p ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="space-y-7">
          {p.status === 'refund_required' && (
            <p className="rounded-xl border border-serious/30 bg-serious/10 px-4 py-3 text-sm text-[#f6b294]">
              This order was cancelled after it was paid. Issue the refund from the {p.method === 'stripe' ? 'Stripe Dashboard (Payments → the payment → Refund)' : 'PayHere merchant portal'}.
            </p>
          )}
          <dl className="divide-y divide-rule/70 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-2.5">
                <dt className="text-grey">{k}</dt>
                <dd className="text-right text-bone">{v}</dd>
              </div>
            ))}
          </dl>

          {p.order && (
            <section>
              <h3 className="mb-2 text-xs font-medium text-dim">Order</h3>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rule bg-pitch/40 px-4 py-3">
                <div>
                  <Link to={`/orders?order=${encodeURIComponent(p.order.order_number)}`} onClick={onClose} className="font-semibold text-bone hover:text-ember-hot">
                    {p.order.order_number}
                  </Link>
                  <p className="text-xs text-dim">
                    {p.order.customer_name}, {p.order.customer_email}
                  </p>
                </div>
                <OrderStatusBadge status={p.order.status} />
              </div>
            </section>
          )}

          {p.method !== 'cod' && (
            <section>
              <h3 className="mb-2 text-xs font-medium text-dim">{p.method === 'stripe' ? 'Stripe events' : 'PayHere notifications'}</h3>
              {!p.events || p.events.length === 0 ? (
                <p className="text-sm text-dim">
                  {p.status === 'pending'
                    ? `Nothing from ${PROVIDER[p.method]} yet. The payment stays unpaid until the server verifies it with ${PROVIDER[p.method]}.`
                    : `No ${PROVIDER[p.method]} messages are recorded for this payment.`}
                </p>
              ) : (
                <ol className="space-y-2">
                  {p.events.map((e, i) => (
                    <li key={i} className="flex items-start gap-3 rounded-xl border border-rule bg-pitch/40 px-4 py-3 text-sm">
                      {e.signature_valid ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-good" aria-hidden="true" /> : <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-hidden="true" />}
                      <div>
                        <p className="text-bone">
                          {e.signature_valid ? 'Verified' : 'Signature invalid, ignored'}
                          <span className="text-grey">, {e.outcome.replace(/_/g, ' ')}</span>
                        </p>
                        <p className="text-xs text-dim">
                          {dateTime(e.at)}
                          {e.provider_status_code !== null && `, PayHere status ${e.provider_status_code}`}
                          {e.outcome_reason && `, ${e.outcome_reason}`}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
        </div>
      )}
    </Drawer>
  )
}
