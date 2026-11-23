import { createContext } from 'react'
import type { User } from '../services/api/types'

/** Shared auth types and context objects (kept apart from the provider for fast refresh). */

/**
 * - `checking`: a saved token exists and is being confirmed with the API.
 * - `guest`: browsing only. Guests can fill a cart but can't place an order.
 * - `signed-in`: a customer account; `user` is null only if the API couldn't be reached to load it.
 */
export type AuthStatus = 'checking' | 'guest' | 'signed-in'

export type AuthView = 'signup' | 'login' | 'account'

/** Why the dialog opened. `checkout` came from the cart, so the copy talks about ordering. */
export type AuthIntent = 'checkout' | 'account'

export interface SignUpInput {
  name: string
  email: string
  phone: string
  password: string
  passwordConfirmation: string
}

export interface LogInInput {
  email: string
  password: string
}

export interface AuthStateValue {
  status: AuthStatus
  user: User | null
  /** `session` goes up every time the dialog opens, so forms start fresh each time. */
  dialog: { open: boolean; view: AuthView; intent: AuthIntent; session: number }
}

export interface AuthActionsValue {
  /** Throws ApiError (field errors, network, throttling) for the form to show. */
  signUp: (input: SignUpInput) => Promise<void>
  logIn: (input: LogInInput) => Promise<void>
  logOut: () => Promise<void>
  /** `onClose` runs once when the dialog closes, signed in or not (e.g. to reopen the cart). */
  openDialog: (view: AuthView, options?: { intent?: AuthIntent; onClose?: () => void }) => void
  setView: (view: AuthView) => void
  closeDialog: () => void
}

export const AuthStateContext = createContext<AuthStateValue | null>(null)
/** Actions live in their own context so components that only dispatch never re-render on auth changes. */
export const AuthActionsContext = createContext<AuthActionsValue | null>(null)
