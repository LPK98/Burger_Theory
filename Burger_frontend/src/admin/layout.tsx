import { useQuery } from '@tanstack/react-query'
import {
  Boxes,
  ChartColumn,
  Clock,
  CreditCard,
  Hamburger,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  Settings,
  Tags,
  TicketPercent,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { cn } from '../lib/utils'
import { useAdminAuth } from './auth-context'
import { useConfirm } from './components/overlay-context'
import { orders } from './lib/endpoints'

const NAV: { label: string; items: { to: string; label: string; icon: typeof Menu }[] }[] = [
  {
    label: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/reports', label: 'Reports', icon: ChartColumn },
    ],
  },
  {
    label: 'Service',
    items: [
      { to: '/orders', label: 'Orders', icon: ReceiptText },
      { to: '/payments', label: 'Payments', icon: CreditCard },
    ],
  },
  {
    label: 'Menu',
    items: [
      { to: '/products', label: 'Products', icon: Hamburger },
      { to: '/categories', label: 'Categories', icon: Tags },
      { to: '/inventory', label: 'Inventory', icon: Boxes },
    ],
  },
  {
    label: 'Guests',
    items: [
      { to: '/customers', label: 'Customers', icon: Users },
      { to: '/promotions', label: 'Promotions', icon: TicketPercent },
    ],
  },
  {
    label: 'Restaurant',
    items: [
      { to: '/hours', label: 'Opening hours', icon: Clock },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M5 13.5C5 8 10 4.5 16 4.5S27 8 27 13.5c0 .8-.6 1.5-1.5 1.5h-19C5.6 15 5 14.3 5 13.5Z" fill="#ea5f17" />
      <rect x="4" y="17" width="24" height="3.6" rx="1.8" fill="#f6f2ec" opacity=".9" />
      <path d="M5.5 23h21c0 2.8-2.2 4.5-5 4.5h-11c-2.8 0-5-1.7-5-4.5Z" fill="#ea5f17" opacity=".85" />
    </svg>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <BrandMark className="h-10 w-10 shrink-0" />
      <div className="leading-none">
        <p className="title whitespace-nowrap text-[1.75rem] text-bone">Burger Theory</p>
        <p className="mt-1.5 text-[0.9375rem] font-medium text-dim">Admin portal</p>
      </div>
    </div>
  )
}

/** Live count of orders waiting for the kitchen to accept them. */
function usePendingCount() {
  return useQuery({
    queryKey: ['orders', 'pending-count'],
    queryFn: async () => (await orders.list({ status: 'pending', per_page: 1 })).meta.total,
    refetchInterval: 30_000,
  }).data
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pending = usePendingCount()
  return (
    <nav aria-label="Admin" className="space-y-6">
      {NAV.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 px-3 text-xs font-medium text-dim">{group.label}</p>
          <ul className="space-y-0.5">
            {group.items.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors',
                      isActive ? 'bg-ember/12 font-semibold text-bone' : 'text-grey hover:bg-smoke hover:text-bone',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className={cn('absolute inset-y-2 left-0 w-0.5 rounded-full bg-ember transition-opacity', isActive ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
                      <Icon className={cn('h-[1.05rem] w-[1.05rem]', isActive ? 'text-ember' : 'text-dim group-hover:text-grey')} aria-hidden="true" />
                      <span className="flex-1">{label}</span>
                      {to === '/orders' && pending ? (
                        <span className="tabular rounded-full bg-ember px-1.5 text-[0.8125rem] font-bold leading-[1.1rem] text-ember-ink" aria-label={`${pending} pending`}>
                          {pending}
                        </span>
                      ) : null}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function Account({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logOut } = useAdminAuth()
  const confirm = useConfirm()
  const initials = (user?.name ?? '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
  return (
    <div className="flex items-center gap-2 rounded-xl border border-rule bg-pitch/40 p-2">
      <NavLink to="/profile" onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 hover:bg-smoke">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ember/15 text-xs font-bold text-ember-hot">{initials}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-bone">{user?.name}</span>
          <span className="block truncate text-xs text-dim">{user?.email}</span>
        </span>
      </NavLink>
      <button
        type="button"
        aria-label="Log out"
        title="Log out"
        onClick={async () => {
          if (await confirm({ title: 'Log out of the admin portal?', confirmLabel: 'Log out', tone: 'primary' })) await logOut()
        }}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-dim hover:bg-smoke hover:text-bone"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}

function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  useFocusTrap(panel, open, onClose)
  useEffect(() => {
    if (!open) return
    document.documentElement.style.overflow = 'hidden'
    const t = window.setTimeout(() => panel.current?.querySelector<HTMLElement>('a, button')?.focus(), 30)
    return () => {
      window.clearTimeout(t)
      document.documentElement.style.overflow = ''
    }
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 animate-[fade_160ms_ease-out] bg-black/65" onClick={onClose} aria-hidden="true" />
      <div ref={panel} role="dialog" aria-modal="true" aria-label="Menu" className="absolute inset-y-0 left-0 flex w-[min(19rem,86vw)] animate-[rise_240ms_var(--ease-out-expo)] flex-col border-r border-rule-strong bg-char">
        <div className="flex items-center justify-between px-4 py-4">
          <Brand />
          <button type="button" onClick={onClose} aria-label="Close menu" className="grid h-9 w-9 place-items-center rounded-lg text-grey hover:bg-smoke hover:text-bone">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-3 py-3">
          <NavList onNavigate={onClose} />
        </div>
        <div className="p-3">
          <Account onNavigate={onClose} />
        </div>
      </div>
    </div>
  )
}

export function AdminShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const main = useRef<HTMLElement>(null)

  // New page: start at the top and move focus to the content for screen readers.
  useEffect(() => {
    window.scrollTo(0, 0)
    main.current?.focus({ preventScroll: true })
  }, [location.pathname])

  return (
    <div className="min-h-dvh lg:pl-64">
      <a href="#admin-main" className="fixed left-3 top-3 z-[90] -translate-y-20 rounded-lg bg-ember px-4 py-2 font-semibold text-ember-ink focus:translate-y-0">
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-rule bg-char/80 backdrop-blur-xl lg:flex">
        <div className="px-5 pb-4 pt-6">
          <Brand />
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-3 py-3">
          <NavList />
        </div>
        <div className="p-3">
          <Account />
        </div>
      </aside>

      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-rule bg-pitch/85 px-4 backdrop-blur-xl lg:hidden">
        <Brand />
        <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu" aria-expanded={menuOpen} className="grid h-10 w-10 place-items-center rounded-lg text-bone hover:bg-smoke">
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>
      <MobileNav open={menuOpen} onClose={() => setMenuOpen(false)} />

      <main id="admin-main" ref={main} tabIndex={-1} className="mx-auto w-full max-w-[90rem] px-4 pb-16 pt-6 outline-none sm:px-6 lg:px-10 lg:pt-9">
        <Outlet />
      </main>
    </div>
  )
}

/** Page title row: condensed title, one line of context, and the page's main actions. */
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  useEffect(() => {
    document.title = `${title} | Burger Theory Admin`
  }, [title])
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="title text-[2.5rem] text-bone sm:text-[3rem]">{title}</h1>
        {description && <p className="mt-2 max-w-[70ch] text-sm text-grey">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
