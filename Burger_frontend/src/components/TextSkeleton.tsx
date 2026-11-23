import { cn } from '../lib/utils'

/** A quiet placeholder bar the height of a line of text, shown while details load. */
export function TextSkeleton({ className }: { className?: string }) {
  return <span className={cn('inline-block h-[0.9em] w-40 max-w-full animate-pulse rounded-[2px] bg-cream/[0.07] align-middle', className)} aria-hidden="true" />
}
