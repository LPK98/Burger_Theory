import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorMessage } from '../lib/api'
import { orders } from '../lib/endpoints'
import { ORDER_STATUS_LABEL } from '../lib/format'
import type { Order, OrderStatus } from '../lib/types'
import { useToast } from './overlay-context'

/** Changes an order's status, asking for a reason before cancelling or rejecting. */
export function useOrderStatus() {
  const queryClient = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: ({ order, status, note }: { order: Order; status: OrderStatus; note?: string }) => orders.setStatus(order.order_number, status, note),
    onSuccess: (updated) => {
      queryClient.setQueryData(['order', updated.order_number], updated)
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success(`${updated.order_number} is now ${ORDER_STATUS_LABEL[updated.status].toLowerCase()}.`)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
}
