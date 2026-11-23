import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../lib/utils'

type Variant = 'primary' | 'outline' | 'ghost' | 'ink'
type Size = 'sm' | 'md' | 'lg'
type Shape = 'square'

const base =
  'group relative inline-flex shrink-0 select-none items-center justify-center gap-2.5 ui whitespace-nowrap ' +
  'transition-[background-color,color,border-color,box-shadow] duration-300 ease-[var(--ease-expo)] ' +
  'disabled:opacity-45 focus-visible:outline-offset-4'

const variants: Record<Variant, string> = {
  // `btn-sheen` (animations.css): a band of light crosses the button on hover.
  primary: 'btn-sheen bg-ember text-ink hover:bg-ember-hot hover:shadow-[0_12px_40px_-14px_rgba(240,120,50,0.75)]',
  outline: 'border border-cream/30 text-cream hover:border-ember hover:text-ember',
  ghost: 'text-cream hover:text-ember',
  ink: 'bg-ink text-cream hover:bg-char',
}

const shapes: Record<Shape, string> = {
  square: 'rounded-[3px]',
}

const sizes: Record<Shape, Record<Size, string>> = {
  square: {
    sm: 'h-10 px-4 text-[0.8125rem]',
    md: 'h-12 px-6 text-[0.9375rem]',
    lg: 'h-14 px-8 text-base',
  },
}

function buttonClass({
  variant = 'primary',
  size = 'md',
  shape = 'square',
  className,
}: { variant?: Variant; size?: Size; shape?: Shape; className?: string } = {}) {
  return cn(base, variants[variant], shapes[shape], sizes[shape][size], className)
}

/** The label rolls up on hover and an identical copy rolls in from below. */
function Label({ children }: { children: ReactNode }) {
  return (
    <span className="roll">
      <span>{children}</span>
      <span aria-hidden="true">{children}</span>
    </span>
  )
}

interface CommonProps {
  variant?: Variant
  size?: Size
  shape?: Shape
  icon?: ReactNode
  /** Place the icon after the label. */
  iconEnd?: boolean
}

export function Button({ variant, size, shape, icon, iconEnd, className, children, type = 'button', ...rest }: CommonProps & ComponentProps<'button'>) {
  return (
    <button type={type} className={buttonClass({ variant, size, shape, className })} {...rest}>
      {!iconEnd && icon}
      <Label>{children}</Label>
      {iconEnd && icon}
    </button>
  )
}

export function ButtonLink({ variant, size, shape, icon, iconEnd, className, children, ...rest }: CommonProps & ComponentProps<'a'>) {
  return (
    <a className={buttonClass({ variant, size, shape, className })} {...rest}>
      {!iconEnd && icon}
      <Label>{children}</Label>
      {iconEnd && icon}
    </a>
  )
}
