import { createContext, useContext } from 'react'
import type { AdminUser } from './lib/types'

export type AuthStatus = 'checking' | 'signed-out' | 'signed-in'

export interface AuthValue {
  status: AuthStatus
  user: AdminUser | null
  /** Why the last session ended, shown on the login page. */
  notice: string | null
  logIn: (email: string, password: string) => Promise<void>
  logOut: () => Promise<void>
  setUser: (user: AdminUser) => void
}

export const AuthContext = createContext<AuthValue | null>(null)

export function useAdminAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAdminAuth must be used inside <AdminAuthProvider>.')
  return value
}
