import { createContext, useContext, type ReactNode } from 'react'

/** Contexts and hooks for the overlay providers (kept apart from the components for fast refresh). */

export interface ConfirmOptions {
  title: string
  body?: ReactNode
  confirmLabel: string
  tone?: 'danger' | 'primary'
}

export interface Toast {
  id: number
  tone: 'success' | 'error'
  message: string
}

export const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null)
export const ToastContext = createContext<{ success: (m: string) => void; error: (m: string) => void } | null>(null)

/** `await confirm({...})` resolves true when the person confirms. */
export function useConfirm() {
  const value = useContext(ConfirmContext)
  if (!value) throw new Error('useConfirm must be used inside <ConfirmProvider>.')
  return value
}

export function useToast() {
  const value = useContext(ToastContext)
  if (!value) throw new Error('useToast must be used inside <ToastProvider>.')
  return value
}
