import { useSyncExternalStore } from 'react'
import { menu } from '../services/api/client'
import type { OpeningHoursInfo } from '../services/api/types'

/**
 * One shared copy of GET /opening-hours for the hours card, the footer and the hours dialog.
 * The API works out "open now" in Colombo time, so the page only has to keep it fresh: it
 * refetches every minute while the tab is visible, when the tab comes back, when the dialog
 * opens, and right after the next open/close moment the API reported.
 */

interface HoursState {
  data: OpeningHoursInfo | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  dialogOpen: boolean
}

const POLL_MS = 60_000

let state: HoursState = { data: null, status: 'idle', dialogOpen: false }
const listeners = new Set<() => void>()
let inFlight: Promise<void> | null = null
let pollTimer: number | undefined
let edgeTimer: number | undefined

function set(changes: Partial<HoursState>) {
  state = { ...state, ...changes }
  listeners.forEach((l) => l())
}

/** Refetch a few seconds after the reported closing time or next opening, so the badge flips on time. */
function scheduleEdge(data: OpeningHoursInfo) {
  window.clearTimeout(edgeTimer)
  const edge = data.status.closes_at ?? data.status.next_opening?.at
  if (!edge) return
  // Both instants come from the server's clock, so the device clock and timezone don't matter.
  const wait = Date.parse(edge) - Date.parse(data.now) + 2_000
  if (wait > 0 && wait < POLL_MS) edgeTimer = window.setTimeout(() => void refreshOpeningHours(), wait)
}

export function refreshOpeningHours(): Promise<void> {
  if (inFlight) return inFlight
  if (!state.data) set({ status: 'loading' })
  inFlight = menu
    .openingHours()
    .then((data) => {
      set({ data, status: 'ready' })
      scheduleEdge(data)
    })
    .catch(() => {
      // Keep showing the last good copy if there is one.
      set({ status: state.data ? 'ready' : 'error' })
    })
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

function onVisibility() {
  if (document.visibilityState === 'visible') void refreshOpeningHours()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    if (state.status === 'idle' || state.status === 'error' || state.data) void refreshOpeningHours()
    pollTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshOpeningHours()
    }, POLL_MS)
    document.addEventListener('visibilitychange', onVisibility)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      window.clearInterval(pollTimer)
      window.clearTimeout(edgeTimer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }
}

const getSnapshot = () => state

export function useOpeningHours(): HoursState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function openHoursDialog() {
  set({ dialogOpen: true })
  void refreshOpeningHours()
}

export function closeHoursDialog() {
  set({ dialogOpen: false })
}
