import { useContext } from 'react'
import { SmoothScrollContext } from '../context/smooth-scroll'

/** Access the shared Lenis instance plus scrollTo / scroll-lock helpers. */
export function useLenis() {
  const value = useContext(SmoothScrollContext)
  if (!value) throw new Error('useLenis must be used inside <SmoothScrollProvider>.')
  return value
}
