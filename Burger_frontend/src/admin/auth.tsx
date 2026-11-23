import { useQueryClient } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { adminToken, ApiError } from './lib/api'
import { auth } from './lib/endpoints'
import { AuthContext, useAdminAuth, type AuthStatus } from './auth-context'
import type { AdminUser } from './lib/types'

/**
 * Admin session. Tokens come only from POST /admin/login (administrators only), and
 * every admin API route checks the role again on the server. A saved token is
 * re-confirmed on load; a non-admin or expired token is dropped.
 */
export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<AuthStatus>(() => (adminToken.get() ? 'checking' : 'signed-out'))
  const [user, setUser] = useState<AdminUser | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const token = adminToken.get()
    if (!token) return
    let cancelled = false
    auth
      .me()
      .then((me) => {
        if (cancelled) return
        if (me.role !== 'admin') {
          adminToken.set(null)
          setNotice('That account isn’t an administrator.')
          return
        }
        setUser(me)
        setStatus('signed-in')
      })
      .catch((error: unknown) => {
        if (cancelled) return
        // 401 already dropped the token (the listener below signs out); other errors keep it.
        if (ApiError.from(error).status === 401) setNotice('Your session expired. Log in again.')
        else setStatus(adminToken.get() ? 'signed-in' : 'signed-out')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(
    () =>
      adminToken.subscribe((token) => {
        if (token === null) {
          setStatus('signed-out')
          setUser(null)
          queryClient.clear()
        }
      }),
    [queryClient],
  )

  const logIn = useCallback(async (email: string, password: string) => {
    const result = await auth.login(email.trim(), password)
    adminToken.set(result.token)
    setUser(result.user)
    setNotice(null)
    setStatus('signed-in')
  }, [])

  const logOut = useCallback(async () => {
    try {
      await auth.logout()
    } catch {
      // The token is forgotten locally either way.
    }
    adminToken.set(null)
    setNotice('You’ve been logged out.')
  }, [])

  const value = useMemo(() => ({ status, user, notice, logIn, logOut, setUser }), [status, user, notice, logIn, logOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Guards every portal page: guests go to /login and come back afterwards. */
export function RequireAdmin() {
  const { status } = useAdminAuth()
  const location = useLocation()
  if (status === 'checking') {
    return (
      <div className="grid min-h-dvh place-items-center" role="status">
        <LoaderCircle className="h-6 w-6 animate-spin text-ember" aria-hidden="true" />
        <span className="sr-only">Checking your session</span>
      </div>
    )
  }
  if (status === 'signed-out') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <Outlet />
}
