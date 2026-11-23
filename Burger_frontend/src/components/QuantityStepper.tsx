import { Minus, Plus } from 'lucide-react'
import type { Ref } from 'react'
import { MAX_QUANTITY } from '../context/cart-store'
import { cn } from '../lib/utils'

interface QuantityStepperProps {
  name: string
  quantity: number
  onChange: (quantity: number) => void
  size?: 'sm' | 'md'
  className?: string
  incrementRef?: Ref<HTMLButtonElement>
}

export function QuantityStepper({ name, quantity, onChange, size = 'md', className, incrementRef }: QuantityStepperProps) {
  const button = cn(
    'grid place-items-center text-cream transition-colors duration-200 hover:bg-ember hover:text-ink disabled:text-cream/30 disabled:hover:bg-transparent',
    size === 'sm' ? 'h-9 w-9' : 'h-11 w-11',
  )
  return (
    <div
      role="group"
      aria-label={`Quantity of ${name}`}
      className={cn('inline-flex items-center overflow-hidden rounded-[3px] border border-cream/25 bg-ink/40', className)}
    >
      <button type="button" className={button} onClick={() => onChange(quantity - 1)} aria-label={quantity === 1 ? `Remove ${name} from cart` : `Remove one ${name}`}>
        <Minus className="h-4 w-4" aria-hidden="true" />
      </button>
      <output className={cn('ui tabular min-w-8 text-center text-bone', size === 'sm' ? 'text-sm' : 'text-base')} aria-live="polite">
        {quantity}
      </output>
      <button
        ref={incrementRef}
        type="button"
        className={button}
        onClick={() => onChange(quantity + 1)}
        disabled={quantity >= MAX_QUANTITY}
        aria-label={`Add one more ${name}`}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}
