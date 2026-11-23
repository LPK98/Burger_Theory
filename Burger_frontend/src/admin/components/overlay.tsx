import { CircleCheck, TriangleAlert, X } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { cn } from '../../lib/utils'
import { ConfirmContext, ToastContext, type ConfirmOptions, type Toast } from './overlay-context'
import { Button, IconButton } from './ui'

/** Locks page scroll while any overlay is open (nested calls are counted). */
let locks = 0
function lockScroll() {
  locks++
  document.documentElement.style.overflow = 'hidden'
}
function unlockScroll() {
  locks = Math.max(0, locks - 1)
  if (locks === 0) document.documentElement.style.overflow = ''
}

function useOverlay(open: boolean, onClose: () => void, panel: React.RefObject<HTMLElement | null>) {
  useFocusTrap(panel, open, onClose)
  useEffect(() => {
    if (!open) return
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    lockScroll()
    const t = window.setTimeout(() => {
      const target = panel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panel.current?.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea') ?? panel.current
      target?.focus()
    }, 30)
    return () => {
      window.clearTimeout(t)
      unlockScroll()
      returnTo?.focus({ preventScroll: true })
    }
  }, [open, panel])
}

/** Side panel for viewing or editing one record. */
export function Drawer({ open, onClose, title, description, children, footer, width = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; width?: 'md' | 'lg' }) {
  const panel = useRef<HTMLElement>(null)
  const titleId = useId()
  useOverlay(open, onClose, panel)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 animate-[fade_200ms_ease-out] bg-black/60 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <aside
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'absolute inset-y-0 right-0 flex w-full animate-[slide-in_320ms_var(--ease-out-expo)] flex-col border-l border-rule-strong bg-char shadow-[-24px_0_80px_-20px_rgb(0_0_0/0.8)] outline-none',
          width === 'lg' ? 'max-w-[46rem]' : 'max-w-[34rem]',
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-rule px-6 py-5">
          <div className="min-w-0">
            <h2 id={titleId} className="title text-[1.75rem] text-bone">
              {title}
            </h2>
            {description && <div className="mt-1.5 text-sm text-grey">{description}</div>}
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X className="h-5 w-5" aria-hidden="true" />
          </IconButton>
        </header>
        <div className="scrollbar-thin flex-1 overflow-y-auto overscroll-contain px-6 py-5">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-rule px-6 py-4">{footer}</footer>}
      </aside>
    </div>
  )
}

/** Centred dialog for short forms and confirmations. */
export function Modal({ open, onClose, title, description, children, footer, size = 'sm' }: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' }) {
  const panel = useRef<HTMLElement>(null)
  const titleId = useId()
  useOverlay(open, onClose, panel)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-[fade_160ms_ease-out] bg-black/65 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <section
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'relative max-h-[100dvh] w-full animate-[rise_260ms_var(--ease-out-expo)] overflow-y-auto border border-rule-strong bg-char shadow-[0_40px_100px_-30px_rgb(0_0_0/0.9)] outline-none max-sm:rounded-t-2xl sm:rounded-2xl',
          size === 'md' ? 'sm:max-w-[34rem]' : 'sm:max-w-[26rem]',
        )}
      >
        <div className="px-6 pt-6">
          <h2 id={titleId} className="text-lg font-semibold text-bone">
            {title}
          </h2>
          {description && <div className="mt-1.5 text-sm leading-relaxed text-grey">{description}</div>}
        </div>
        {children && <div className="px-6 pt-5">{children}</div>}
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 px-6 pb-6 pt-6">{footer}</footer>}
      </section>
    </div>
  )
}

// ── Confirmation ──────────────────────────────────────────────────────────────

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null)
  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setRequest({ ...options, resolve })), [])
  const settle = (ok: boolean) => {
    request?.resolve(ok)
    setRequest(null)
  }
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={request !== null}
        onClose={() => settle(false)}
        title={request?.title}
        description={request?.body}
        footer={
          <>
            <Button onClick={() => settle(false)}>Keep it</Button>
            <Button data-autofocus variant={request?.tone === 'primary' ? 'primary' : 'danger'} onClick={() => settle(true)}>
              {request?.confirmLabel}
            </Button>
          </>
        }
      />
    </ConfirmContext.Provider>
  )
}

// ── Toasts ────────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const next = useRef(1)
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const push = useCallback(
    (tone: Toast['tone'], message: string) => {
      const id = next.current++
      setToasts((t) => [...t.slice(-3), { id, tone, message }])
      window.setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4000)
    },
    [dismiss],
  )
  const api = useMemo(() => ({ success: (m: string) => push('success', m), error: (m: string) => push('error', m) }), [push])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className="glass pointer-events-auto flex animate-[rise_260ms_var(--ease-out-expo)] items-start gap-3 rounded-xl px-4 py-3 text-sm text-bone shadow-[0_20px_50px_-20px_rgb(0_0_0/0.9)]"
          >
            {t.tone === 'success' ? (
              <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-good" aria-hidden="true" />
            ) : (
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-hidden="true" />
            )}
            <p className="min-w-0 flex-1">{t.message}</p>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-dim hover:text-bone">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
