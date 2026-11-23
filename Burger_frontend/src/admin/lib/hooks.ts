import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'

/** The value after it has stopped changing for `delay` ms (for search boxes). */
export function useDebounced<T>(value: T, delay = 300): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(value), delay)
    return () => window.clearTimeout(t)
  }, [value, delay])
  return settled
}

/**
 * A search box whose text is applied (e.g. to the URL) once typing pauses.
 * Only a change in the debounced text calls `apply`, so clearing filters elsewhere is never undone.
 */
export function useSearchBox(initial: string, apply: (value: string) => void) {
  const [input, setInput] = useState(initial)
  const debounced = useDebounced(input)
  const last = useRef(debounced)
  useEffect(() => {
    if (last.current === debounced) return
    last.current = debounced
    apply(debounced)
  }, [debounced, apply])
  return [input, setInput] as const
}

/** Current time, refreshed every `everyMs` (for "12 min ago" labels on the board). */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), everyMs)
    return () => window.clearInterval(t)
  }, [everyMs])
  return now
}

/**
 * Filters kept in the URL, so a filtered view can be linked and survives a reload.
 * Setting a filter resets `page` unless the page itself is what changed.
 */
export function useUrlFilters<K extends string>(keys: readonly K[]) {
  const [params, setParams] = useSearchParams()
  const values = Object.fromEntries(keys.map((k) => [k, params.get(k) ?? ''])) as Record<K, string>
  const set = useCallback(
    (changes: Partial<Record<K | 'page', string | number | null>>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(changes)) {
            if (v === null || v === undefined || v === '' || (k === 'page' && Number(v) <= 1)) next.delete(k)
            else next.set(k, String(v))
          }
          if (!('page' in changes)) next.delete('page')
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )
  const page = Math.max(1, Number(params.get('page')) || 1)
  return { values, set, page }
}
