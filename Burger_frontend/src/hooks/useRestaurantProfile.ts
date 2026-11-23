import { useSyncExternalStore } from 'react'
import { menu } from '../services/api/client'
import type { RestaurantProfile } from '../services/api/types'

/**
 * The restaurant's contact details, address and social links from GET /restaurant, as an
 * administrator set them in the admin portal (Settings). One shared copy for the contact
 * section, footer, mobile menu and cart; refetched when the tab becomes visible again.
 */

interface ProfileState {
  profile: RestaurantProfile | null
  status: 'idle' | 'loading' | 'ready' | 'error'
}

let state: ProfileState = { profile: null, status: 'idle' }
const listeners = new Set<() => void>()
let inFlight: Promise<void> | null = null
let lastFetch = 0

function set(changes: Partial<ProfileState>) {
  state = { ...state, ...changes }
  listeners.forEach((l) => l())
}

function load(): Promise<void> {
  if (inFlight) return inFlight
  if (!state.profile) set({ status: 'loading' })
  lastFetch = Date.now()
  inFlight = menu
    .restaurant()
    .then((info) => set({ profile: info.profile, status: 'ready' }))
    .catch(() => set({ status: state.profile ? 'ready' : 'error' }))
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

function onVisibility() {
  // Details change rarely; at most one refresh every five minutes.
  if (document.visibilityState === 'visible' && Date.now() - lastFetch > 300_000) void load()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    if (state.status !== 'loading') void load()
    document.addEventListener('visibilitychange', onVisibility)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) document.removeEventListener('visibilitychange', onVisibility)
  }
}

const getSnapshot = () => state

export function useRestaurantProfile(): ProfileState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** "tel:" link from a number as typed ("076 166 4575" → "tel:0761664575"). */
export function phoneHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}

/** The address as two lines: street ("F 42/6, Dehalkalawita") and area ("Kegalle 71230"). Empty parts are skipped. */
export function addressLines(address: RestaurantProfile['address']): { street: string; area: string } {
  return {
    street: [address.line1, address.line2].filter(Boolean).join(', '),
    area: [address.city, address.postal_code].filter(Boolean).join(' '),
  }
}

export type SocialId = keyof RestaurantProfile['social']

export const SOCIAL_LABEL: Record<SocialId, string> = { instagram: 'Instagram', facebook: 'Facebook' }

/** Social links the admin has filled in, in display order. */
export function socialLinks(profile: RestaurantProfile | null): { id: SocialId; label: string; href: string }[] {
  if (!profile) return []
  return (['instagram', 'facebook'] as const).flatMap((id) => {
    const href = profile.social[id]
    return href ? [{ id, label: SOCIAL_LABEL[id], href }] : []
  })
}
