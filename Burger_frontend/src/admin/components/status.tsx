import { ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from '../lib/format'
import type { OrderStatus, PaymentMethod, PaymentStatus, ProductStockStatus, StockStatus } from '../lib/types'
import { Badge, type Tone } from './ui'

const ORDER_TONE: Record<OrderStatus, Tone> = {
  pending: 'warn',
  confirmed: 'info',
  preparing: 'info',
  ready: 'ember',
  out_for_delivery: 'info',
  delivered: 'good',
  cancelled: 'bad',
  rejected: 'bad',
}

const PAYMENT_TONE: Record<PaymentStatus, Tone> = {
  pending: 'warn',
  paid: 'good',
  failed: 'bad',
  cancelled: 'neutral',
  charged_back: 'bad',
  refund_required: 'serious',
}

export const OrderStatusBadge = ({ status }: { status: OrderStatus }) => <Badge tone={ORDER_TONE[status]}>{ORDER_STATUS_LABEL[status]}</Badge>

export const PaymentStatusBadge = ({ status }: { status: PaymentStatus }) => <Badge tone={PAYMENT_TONE[status]}>{PAYMENT_STATUS_LABEL[status]}</Badge>

export const PaymentMethodText = ({ method }: { method: PaymentMethod }) => <span className="text-grey">{PAYMENT_METHOD_LABEL[method]}</span>

export function StockBadge({ status }: { status: StockStatus | ProductStockStatus }) {
  switch (status) {
    case 'out_of_stock':
      return <Badge tone="bad">Out of stock</Badge>
    case 'low_stock':
      return <Badge tone="warn">Low stock</Badge>
    case 'unlimited':
      return <Badge tone="neutral">Made to order</Badge>
    default:
      return <Badge tone="good">In stock</Badge>
  }
}
