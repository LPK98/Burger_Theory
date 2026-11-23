import { useContext } from 'react'
import { AuthActionsContext, AuthStateContext } from '../context/auth-store'

export function useAuth() {
  const value = useContext(AuthStateContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.')
  return value
}

export function useAuthActions() {
  const value = useContext(AuthActionsContext)
  if (!value) throw new Error('useAuthActions must be used inside <AuthProvider>.')
  return value
}
