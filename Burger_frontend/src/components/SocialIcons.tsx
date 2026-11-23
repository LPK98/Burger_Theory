import { SITE } from '../data/site'
import { socialLinks, useRestaurantProfile, type SocialId } from '../hooks/useRestaurantProfile'
import { cn } from '../lib/utils'

/** Lucide 1.x no longer ships brand marks, so these two are drawn here. */
export function SocialIcon({ id, className }: { id: SocialId; className?: string }) {
  if (id === 'instagram') {
    return (
      <svg viewBox="0 0 24 24" className={cn('h-5 w-5', className)} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" focusable="false">
        <rect x="3" y="3" width="18" height="18" rx="5.2" />
        <circle cx="12" cy="12" r="4.1" />
        <circle cx="17.4" cy="6.6" r="1.15" fill="currentColor" stroke="none" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" className={cn('h-5 w-5', className)} fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M13.6 21v-7.6h2.6l.4-3h-3V8.5c0-.87.26-1.46 1.5-1.46h1.6V4.36A21.5 21.5 0 0 0 14.38 4.2c-2.3 0-3.88 1.4-3.88 3.98v2.22H7.9v3h2.6V21h3.1Z" />
    </svg>
  )
}

/** The social links set in the admin portal; renders nothing until at least one is set. */
export function SocialLinks({ className, itemClassName }: { className?: string; itemClassName?: string }) {
  const links = socialLinks(useRestaurantProfile().profile)
  if (links.length === 0) return null
  return (
    <ul className={cn('flex items-center gap-3', className)}>
      {links.map((s) => (
        <li key={s.id}>
          <a
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${SITE.name} on ${s.label} (opens in a new tab)`}
            className={cn(
              'grid h-11 w-11 place-items-center rounded-full border border-cream/20 text-cream transition-colors duration-300 hover:border-ember hover:bg-ember hover:text-ink',
              itemClassName,
            )}
          >
            <SocialIcon id={s.id} />
          </a>
        </li>
      ))}
    </ul>
  )
}
