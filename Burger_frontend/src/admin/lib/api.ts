import axios, { AxiosError, type AxiosResponse } from 'axios'

/**
 * HTTP client for the admin portal. It keeps its own token, separate from the customer
 * site's (src/services/api/client.ts): signing in to one never signs you in to the other.
 */

export const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1'

const TOKEN_KEY = 'burger-theory:admin-token'
let memoryToken: string | null = null

type Listener = (token: string | null) => void
const listeners = new Set<Listener>()

export const adminToken = {
  get(): string | null {
    try {
      return window.localStorage.getItem(TOKEN_KEY) ?? memoryToken
    } catch {
      return memoryToken
    }
  },
  set(token: string | null): void {
    const changed = adminToken.get() !== token
    memoryToken = token
    try {
      if (token === null) window.localStorage.removeItem(TOKEN_KEY)
      else window.localStorage.setItem(TOKEN_KEY, token)
    } catch {
      // Storage blocked: the in-memory copy keeps this tab signed in.
    }
    if (changed) listeners.forEach((l) => l(token))
  },
  /** Runs when the token is set or dropped (including a 401 or another tab signing out). */
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    const onStorage = (e: StorageEvent) => {
      if (e.key === TOKEN_KEY || e.key === null) listener(adminToken.get())
    }
    window.addEventListener('storage', onStorage)
    return () => {
      listeners.delete(listener)
      window.removeEventListener('storage', onStorage)
    }
  },
}

export const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20_000,
  headers: { Accept: 'application/json' },
})

http.interceptors.request.use((config) => {
  const token = adminToken.get()
  if (token) config.headers.set('Authorization', `Bearer ${token}`)
  return config
})

http.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (error instanceof AxiosError && error.response?.status === 401) adminToken.set(null)
    return Promise.reject(ApiError.from(error))
  },
)

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fieldErrors: Record<string, string[]>
  readonly details: Record<string, unknown>

  constructor(message: string, status: number, code: string, fieldErrors: Record<string, string[]> = {}, details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
    this.details = details
  }

  static from(error: unknown): ApiError {
    if (error instanceof ApiError) return error
    if (!(error instanceof AxiosError)) return new ApiError('Something went wrong.', 0, 'unknown')
    if (!error.response) return new ApiError('Can’t reach the Burger Theory API. Check that the backend is running.', 0, 'network_error')
    const { status, data } = error.response as AxiosResponse<{ message?: string; code?: string; errors?: Record<string, string[]>; details?: Record<string, unknown> }>
    const message = status === 429 ? 'Too many attempts. Wait a minute, then try again.' : (data?.message ?? 'Something went wrong.')
    if (data?.errors) return new ApiError(message, status, 'validation_failed', data.errors)
    return new ApiError(message, status, data?.code ?? (status === 403 ? 'forbidden' : 'unknown'), {}, data?.details ?? {})
  }

  /** First message for a field, e.g. fieldError('name'). */
  field(name: string): string | undefined {
    return this.fieldErrors[name]?.[0]
  }
}

/** Human message for any thrown value. */
export function errorMessage(error: unknown): string {
  return ApiError.from(error).message
}

export async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  return (await http.get<T>(url, { params: clean(params) })).data
}

export async function send<T>(method: 'post' | 'put' | 'patch' | 'delete', url: string, body?: unknown): Promise<T> {
  return (await http.request<T>({ method, url, data: body })).data
}

/** Drops empty filters so URLs stay tidy. */
function clean(params?: Record<string, unknown>) {
  if (!params) return undefined
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''))
}
