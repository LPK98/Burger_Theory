import { cn } from '../lib/utils'

/**
 * The Bun Theory mark: a burger drawn as an exploded diagram — crown, patty and heel
 * held apart by a sliver of air — next to a condensed wordmark. Inside a `.logo-link`,
 * the crown and heel drift apart a little on hover (animations.css).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('logo-mark h-8 w-8', className)} aria-hidden="true" focusable="false">
      <path className="logo-crown" d="M4 13.2C4 7 9.4 3 16 3s12 4 12 10.2a.8.8 0 0 1-.8.8H4.8a.8.8 0 0 1-.8-.8Z" fill="currentColor" />
      <rect x="2.5" y="16.6" width="27" height="4.6" rx="2.3" fill="currentColor" />
      <path className="logo-heel" d="M4.6 24h22.8v1.4c0 2.6-2.1 3.9-4.7 3.9H9.3c-2.6 0-4.7-1.3-4.7-3.9V24Z" fill="currentColor" />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 text-bone', className)}>
      <LogoMark className="text-ember" />
      {/* Caps sit high in their line box; 0.07em down centres them on the mark. */}
      <span className="display-sm relative top-[0.07em] whitespace-nowrap text-[1.4rem] leading-none">Bun Theory</span>
    </span>
  )
}
