import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Banknote, CreditCard, Mail, MapPin, Phone, ShoppingBag } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { cn } from '../../lib/utils'
import { errorMessage } from '../lib/api'
import { orders } from '../lib/endpoints'
import { dateTime, money, ORDER_STATUS_ACTION, PAYMENT_METHOD_LABEL } from '../lib/format'
import type { Order, OrderStatus } from '../lib/types'
import { useOrderStatus } from './order-actions'
import { Drawer, Modal } from './overlay'
import { useToast } from './overlay-context'
import { OrderStatusBadge, PaymentStatusBadge } from './status'
import { Button, ErrorState, Skeleton, TextArea } from './ui'

const VOID: OrderStatus[] = ['cancelled', 'rejected']

export function ReasonModal({ target, onClose, onSubmit, pending }: { target: { order: Order; status: OrderStatus } | null; onClose: () => void; onSubmit: (note: string) => void; pending: boolean }) {
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | undefined>()
  const rejecting = target?.status === 'rejected'
  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      title={rejecting ? `Reject ${target?.order.order_number}?` : `Cancel ${target?.order.order_number}?`}
      description={
        <>
          The customer sees this reason. Stock and ingredients go back to inventory
          {target?.order.payment_status === 'paid' ? ', and the order is flagged for a refund.' : '.'}
        </>
      }
      footer={
        <>
          <Button onClick={onClose}>Keep the order</Button>
          <Button
            variant="danger"
            loading={pending}
            onClick={() => {
              if (!note.trim()) return setError('Give the customer a reason.')
              onSubmit(note.trim())
            }}
          >
            {rejecting ? 'Reject order' : 'Cancel order'}
          </Button>
        </>
      }
    >
      <TextArea
        label="Reason"
        value={note}
        maxLength={500}
        onChange={(e) => {
          setNote(e.target.value)
          setError(undefined)
        }}
        placeholder={rejecting ? 'e.g. We’re at capacity for the next hour.' : 'e.g. Customer called to cancel.'}
        error={error}
      />
    </Modal>
  )
}

export function OrderDrawer({ orderNumber, onClose }: { orderNumber: string | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const query = useQuery({ queryKey: ['order', orderNumber], queryFn: () => orders.get(orderNumber!), enabled: orderNumber !== null })
  const status = useOrderStatus()
  const [reasonFor, setReasonFor] = useState<{ order: Order; status: OrderStatus } | null>(null)

  const collect = useMutation({
    mutationFn: (o: Order) => orders.collectCash(o.order_number),
    onSuccess: (updated) => {
      queryClient.setQueryData(['order', updated.order_number], updated)
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success(`Cash recorded for ${updated.order_number}.`)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const o = query.data
  const advance = o?.next_statuses.filter((s) => !VOID.includes(s)) ?? []
  const voids = o?.next_statuses.filter((s) => VOID.includes(s)) ?? []
  const awaitingOnline = o?.status === 'pending' && o.payment_method !== 'cod' && o.payment_status !== 'paid'
  const canCollect = o?.payment_method === 'cod' && o.payment_status === 'pending' && ['ready', 'out_for_delivery', 'delivered'].includes(o.status)

  return (
    <>
      <Drawer
        open={orderNumber !== null}
        onClose={onClose}
        width="lg"
        title={orderNumber ?? ''}
        description={
          o && (
            <span className="flex flex-wrap items-center gap-2">
              <OrderStatusBadge status={o.status} />
              <PaymentStatusBadge status={o.payment_status} />
              <span className="text-dim">Placed {dateTime(o.created_at)}</span>
            </span>
          )
        }
        footer={
          o &&
          (advance.length > 0 || voids.length > 0 || canCollect) && (
            <>
              {voids.map((s) => (
                <Button key={s} variant="danger" onClick={() => setReasonFor({ order: o, status: s })}>
                  {ORDER_STATUS_ACTION[s]}
                </Button>
              ))}
              <span className="flex-1" />
              {canCollect && (
                <Button icon={<Banknote className="h-4 w-4" aria-hidden="true" />} loading={collect.isPending} onClick={() => collect.mutate(o)}>
                  Record cash collected
                </Button>
              )}
              {advance.map((s) => (
                <Button
                  key={s}
                  variant="primary"
                  disabled={s === 'confirmed' && awaitingOnline}
                  loading={status.isPending && status.variables?.status === s}
                  onClick={() => status.mutate({ order: o, status: s })}
                >
                  {ORDER_STATUS_ACTION[s]}
                </Button>
              ))}
            </>
          )
        }
      >
        {query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
        ) : !o ? (
          <div className="space-y-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-40" />
            <Skeleton className="h-32" />
          </div>
        ) : (
          <div className="space-y-7">
            {awaitingOnline && (
              <p className="rounded-xl border border-warn/30 bg-warn/8 px-4 py-3 text-sm text-[#ffd98a]">
                Waiting for {o.payment_method === 'stripe' ? 'Stripe' : 'PayHere'}. The order can be confirmed once the server has verified the payment.
              </p>
            )}

            <section aria-labelledby="o-customer" className="grid gap-5 sm:grid-cols-2">
              <div>
                <h3 id="o-customer" className="mb-2 text-xs font-medium text-dim">
                  Customer
                </h3>
                <Link to={`/customers?customer=${o.user_id}`} onClick={onClose} className="font-semibold text-bone hover:text-ember-hot">
                  {o.customer.name}
                </Link>
                <p className="mt-1.5 flex items-center gap-2 text-sm text-grey">
                  <Mail className="h-3.5 w-3.5 text-dim" aria-hidden="true" />
                  <a href={`mailto:${o.customer.email}`} className="hover:text-bone">
                    {o.customer.email}
                  </a>
                </p>
                <p className="mt-1 flex items-center gap-2 text-sm text-grey">
                  <Phone className="h-3.5 w-3.5 text-dim" aria-hidden="true" />
                  <a href={`tel:${o.customer.phone}`} className="hover:text-bone">
                    {o.customer.phone}
                  </a>
                </p>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-medium text-dim">{o.fulfilment_type === 'delivery' ? 'Delivery' : 'Pickup'}</h3>
                {o.fulfilment_type === 'delivery' && o.delivery_address ? (
                  <div className="flex gap-2 text-sm text-grey">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-dim" aria-hidden="true" />
                    <div>
                      <p className="text-bone">{o.delivery_address.recipient_name}</p>
                      <p>{o.delivery_address.line1}</p>
                      {o.delivery_address.line2 && <p>{o.delivery_address.line2}</p>}
                      <p>
                        {o.delivery_address.city} {o.delivery_address.postal_code}
                      </p>
                      {o.delivery_address.phone && <p>{o.delivery_address.phone}</p>}
                      {o.delivery_address.delivery_instructions && <p className="mt-1 italic">“{o.delivery_address.delivery_instructions}”</p>}
                    </div>
                  </div>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-grey">
                    <ShoppingBag className="h-3.5 w-3.5 text-dim" aria-hidden="true" />
                    Collected at the counter
                  </p>
                )}
                {o.estimated_ready_at && !['delivered', 'cancelled', 'rejected'].includes(o.status) && <p className="mt-2 text-sm text-grey">Ready by about {dateTime(o.estimated_ready_at)}</p>}
              </div>
            </section>

            {o.notes && (
              <section>
                <h3 className="mb-2 text-xs font-medium text-dim">Customer note</h3>
                <p className="rounded-lg border border-rule bg-pitch/50 px-3 py-2 text-sm text-bone/90">{o.notes}</p>
              </section>
            )}

            <section aria-labelledby="o-items">
              <h3 id="o-items" className="mb-2 text-xs font-medium text-dim">
                Items
              </h3>
              <table className="w-full text-sm">
                <caption className="sr-only">Items in {o.order_number}</caption>
                <tbody>
                  {o.items.map((it, i) => (
                    <tr key={i} className="border-b border-rule/70">
                      <td className="tabular w-10 py-2.5 font-semibold text-ember-hot">{it.quantity}×</td>
                      <td className="py-2.5 text-bone">{it.name}</td>
                      <td className="tabular py-2.5 text-right text-grey">{money(it.unit_price)}</td>
                      <td className="tabular w-28 py-2.5 text-right text-bone">{money(it.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="text-grey">
                  <tr>
                    <td colSpan={3} className="pt-3 text-right">
                      Subtotal
                    </td>
                    <td className="tabular pt-3 text-right">{money(o.subtotal)}</td>
                  </tr>
                  {o.discount_total > 0 && (
                    <tr>
                      <td colSpan={3} className="pt-1 text-right">
                        Discount {o.coupon_code && <span className="text-dim">({o.coupon_code})</span>}
                      </td>
                      <td className="tabular pt-1 text-right">−{money(o.discount_total)}</td>
                    </tr>
                  )}
                  {o.fulfilment_type === 'delivery' && (
                    <tr>
                      <td colSpan={3} className="pt-1 text-right">
                        Delivery
                      </td>
                      <td className="tabular pt-1 text-right">{o.delivery_fee > 0 ? money(o.delivery_fee) : 'Free'}</td>
                    </tr>
                  )}
                  <tr className="text-base font-semibold text-bone">
                    <td colSpan={3} className="pt-2 text-right">
                      Total
                    </td>
                    <td className="tabular pt-2 text-right">{money(o.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </section>

            <section aria-labelledby="o-payment">
              <h3 id="o-payment" className="mb-2 text-xs font-medium text-dim">
                Payment
              </h3>
              <div className="space-y-2">
                {(o.payments ?? (o.payment ? [o.payment] : [])).map((p) => (
                  <div key={p.reference} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rule bg-pitch/40 px-4 py-3 text-sm">
                    <div className="flex items-center gap-3">
                      {p.method === 'cod' ? <Banknote className="h-4 w-4 text-dim" aria-hidden="true" /> : <CreditCard className="h-4 w-4 text-dim" aria-hidden="true" />}
                      <div>
                        <p className="text-bone">
                          {PAYMENT_METHOD_LABEL[p.method]}
                          {p.provider_method && <span className="text-grey"> ({p.provider_method}{p.card_mask ? ` •••• ${p.card_mask.slice(-4)}` : ''})</span>}
                        </p>
                        <p className="text-xs text-dim">
                          {p.reference}
                          {p.paid_at && `, paid ${dateTime(p.paid_at)}`}
                          {p.collected_at && `, cash collected ${dateTime(p.collected_at)}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tabular text-bone">{money(p.amount)}</span>
                      <PaymentStatusBadge status={p.status} />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {o.timeline && o.timeline.length > 0 && (
              <section aria-labelledby="o-timeline">
                <h3 id="o-timeline" className="mb-3 text-xs font-medium text-dim">
                  Timeline
                </h3>
                <ol className="relative ml-1.5 border-l border-rule-strong">
                  {o.timeline.map((t, i) => (
                    <li key={i} className="relative pb-4 pl-5 last:pb-0">
                      <span className={cn('absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-char', i === o.timeline!.length - 1 ? 'bg-ember' : 'bg-grey')} aria-hidden="true" />
                      <p className="text-sm text-bone">
                        {t.label}
                        <span className="text-dim">
                          {' '}
                          by {t.actor === 'admin' ? (t.changed_by ?? 'staff') : t.actor === 'customer' ? 'the customer' : 'the system'}
                        </span>
                      </p>
                      <p className="text-xs text-dim">{dateTime(t.at)}</p>
                      {t.note && <p className="mt-1 text-[0.8125rem] text-grey">“{t.note}”</p>}
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        )}
      </Drawer>

      <ReasonModal
        key={reasonFor ? `${reasonFor.order.order_number}-${reasonFor.status}` : 'none'}
        target={reasonFor}
        onClose={() => setReasonFor(null)}
        pending={status.isPending}
        onSubmit={(note) => {
          if (!reasonFor) return
          status.mutate({ ...reasonFor, note }, { onSuccess: () => setReasonFor(null) })
        }}
      />
    </>
  )
}
