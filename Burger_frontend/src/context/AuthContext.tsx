import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { auth, onAuthTokenChange, tokens } from '../services/api/client'
import type { User } from '../services/api/types'
import { AuthActionsContext, AuthStateContext, type AuthActionsValue, type AuthStateValue, type AuthStatus } from './auth-store'

interface Session {
  status: AuthStatus
  user: User | null
}

const DEVICE_NAME = 'storefront'

/**
 * Confirms a saved token with the API and loads the customer it belongs to.
 * Resolves to null when the token is gone by the time the answer arrives: a 401 drops
 * it (and the token listener turns that into `guest`), and so does signing out meanwhile.
 */
async function confirmToken(token: string): Promise<Session | null> {
  try {
    const user = await auth.me()
    return tokens.auth() === token ? { status: 'signed-in', user } : null
  } catch {
    // API down or 5xx: keep the session. The API still checks the token on every order.
    return tokens.auth() === token ? { status: 'signed-in', user: null } : null
  }
}

/**
 * Customer accounts. Anyone can browse and fill the (local) cart. Placing an order needs
 * an account: the cart sends guests to the sign-up dialog, and the API rejects orders
 * without a token anyway (POST /orders sits behind auth:sanctum).
 *
 * The token itself lives only in services/api/client.ts; this provider mirrors who is
 * signed in for the UI and owns the sign-up / log-in dialog state.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(() => ({ status: tokens.auth() ? 'checking' : 'guest', user: null }))
  const [dialog, setDialog] = useState<AuthStateValue['dialog']>({ open: false, view: 'signup', intent: 'account', session: 0 })
  const afterClose = useRef<(() => void) | null>(null)

  // A token saved by an earlier visit starts as `checking` until the API confirms it.
  useEffect(() => {
    const token = tokens.auth()
    if (!token) return
    let cancelled = false
    void confirmToken(token).then((next) => {
      if (!cancelled && next) setSession(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(
    () =>
      onAuthTokenChange((token, source) => {
        if (token === null) setSession({ status: 'guest', user: null })
        // Sign-ins in this tab set the user themselves; another tab's sign-in has to be looked up.
        else if (source === 'other-tab') {
          setSession({ status: 'checking', user: null })
          void confirmToken(token).then((next) => next && setSession(next))
        }
      }),
    [],
  )

  const actions = useMemo<AuthActionsValue>(
    () => ({
      async signUp(input) {
        const user = await auth.register({
          name: input.name.trim(),
          email: input.email.trim(),
          phone: input.phone.trim() || null,
          password: input.password,
          password_confirmation: input.passwordConfirmation,
          device_name: DEVICE_NAME,
        })
        setSession({ status: 'signed-in', user })
      },
      async logIn(input) {
        const user = await auth.login({ email: input.email.trim(), password: input.password, device_name: DEVICE_NAME })
        setSession({ status: 'signed-in', user })
      },
      async logOut() {
        try {
          await auth.logout()
        } catch {
          // The token is forgotten locally either way; an unreachable API just can't revoke it early.
        }
        setSession({ status: 'guest', user: null })
      },
      openDialog(view, options = {}) {
        afterClose.current = options.onClose ?? null
        setDialog((d) => ({ open: true, view, intent: options.intent ?? 'account', session: d.session + 1 }))
      },
      setView: (view) => setDialog((d) => ({ ...d, view })),
      closeDialog() {
        setDialog((d) => ({ ...d, open: false }))
        const next = afterClose.current
        afterClose.current = null
        next?.()
      },
    }),
    [],
  )

  const value = useMemo<AuthStateValue>(() => ({ ...session, dialog }), [session, dialog])

  return (
    <AuthActionsContext.Provider value={actions}>
      <AuthStateContext.Provider value={value}>{children}</AuthStateContext.Provider>
    </AuthActionsContext.Provider>
  )
}
