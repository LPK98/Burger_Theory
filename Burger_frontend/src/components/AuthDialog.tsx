import { CircleAlert, Eye, EyeOff, LogOut, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ComponentProps, type FormEvent } from 'react'
import type { AuthIntent } from '../context/auth-store'
import { SITE } from '../data/site'
import { useAuth, useAuthActions } from '../hooks/useAuth'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useLenis } from '../hooks/useLenis'
import { gsap, useGSAP } from '../lib/gsap'
import { cn, prefersReducedMotion } from '../lib/utils'
import { ApiError } from '../services/api/client'
import { Button } from './Button'

const COPY: Record<'signup' | 'login', Record<AuthIntent, { eyebrow: string; title: string; lead: string }>> = {
  signup: {
    checkout: {
      eyebrow: 'One step before checkout',
      title: 'Sign up to order',
      lead: 'The menu is open to everyone. To place an order, create an account so we know who it’s for.',
    },
    account: {
      eyebrow: `${SITE.name} account`,
      title: 'Create an account',
      lead: 'An account lets you order online. The menu stays open to everyone.',
    },
  },
  login: {
    checkout: {
      eyebrow: 'One step before checkout',
      title: 'Log in to order',
      lead: 'Welcome back. Log in and your cart will be waiting.',
    },
    account: {
      eyebrow: `${SITE.name} account`,
      title: 'Welcome back',
      lead: 'Log in to order online.',
    },
  },
}

export function AuthDialog() {
  const { status, user, dialog } = useAuth()
  const { closeDialog } = useAuthActions()
  const { open, view, intent, session } = dialog
  const { lock, unlock } = useLenis()

  const root = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const firstRun = useRef(true)
  const titleId = useId()
  const leadId = useId()

  useFocusTrap(panel, open, closeDialog)

  // Lock the page behind the dialog, move focus in, and give it back on close.
  useEffect(() => {
    if (!open) return
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    lock()
    const timer = window.setTimeout(() => (panel.current?.querySelector('input') ?? closeButton.current)?.focus(), 80)
    return () => {
      window.clearTimeout(timer)
      unlock()
      returnFocus?.focus({ preventScroll: true })
    }
  }, [open, lock, unlock])

  useGSAP(
    () => {
      const overlay = root.current?.querySelector('[data-overlay]') ?? []
      if (firstRun.current) {
        firstRun.current = false
        gsap.set(overlay, { autoAlpha: 0 })
        gsap.set(panel.current, { autoAlpha: 0, y: 40 })
        if (!open) return
      }
      const speed = prefersReducedMotion() ? 0 : 1
      if (open) {
        gsap.set(root.current, { visibility: 'visible' })
        gsap.to(overlay, { autoAlpha: 1, duration: 0.4 * speed, ease: 'power2.out', overwrite: true })
        gsap.to(panel.current, { autoAlpha: 1, y: 0, duration: 0.75 * speed, ease: 'expo.out', overwrite: true })
      } else {
        gsap.to(panel.current, { autoAlpha: 0, y: 24, duration: 0.35 * speed, ease: 'power2.in', overwrite: true })
        gsap.to(overlay, {
          autoAlpha: 0,
          duration: 0.35 * speed,
          delay: 0.05 * speed,
          overwrite: true,
          onComplete: () => {
            gsap.set(root.current, { visibility: 'hidden' })
          },
        })
      }
    },
    { scope: root, dependencies: [open] },
  )

  const signedIn = status !== 'guest'
  const heading =
    view === 'account'
      ? signedIn
        ? { eyebrow: 'Signed in', title: 'Your account', lead: user ? `You can order online as ${user.name}.` : 'You can order online.' }
        : { eyebrow: `${SITE.name} account`, title: 'Signed out', lead: 'Log in again to order online.' }
      : COPY[view][intent]

  return (
    <div ref={root} className="invisible fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4" inert={!open}>
      <div data-overlay className="absolute inset-0 bg-black/75" onClick={closeDialog} aria-hidden="true" />
      <section
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={leadId}
        className="relative flex max-h-[100dvh] w-full flex-col border-line bg-char shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)] max-sm:border-t sm:max-h-[calc(100dvh-2rem)] sm:max-w-[29rem] sm:rounded-[3px] sm:border"
      >
        <header className="flex items-start justify-between gap-4 px-6 pt-6 sm:px-8 sm:pt-7">
          <div className="min-w-0">
            <p className="ui text-[0.75rem] uppercase tracking-[0.18em] text-ember">{heading.eyebrow}</p>
            <h2 id={titleId} className="display mt-2 text-[2.6rem] text-cream">
              {heading.title}
            </h2>
          </div>
          <button
            ref={closeButton}
            type="button"
            onClick={closeDialog}
            aria-label="Close"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-cream/20 text-cream transition-colors hover:border-ember hover:text-ember"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="overflow-y-auto overscroll-contain px-6 pb-7 [scrollbar-color:var(--color-line)_transparent] [scrollbar-width:thin] sm:px-8" data-lenis-prevent>
          <p id={leadId} className="mt-3 text-[1rem] leading-relaxed text-bone/70">
            {heading.lead}
          </p>
          {view === 'account' ? <AccountPanel /> : <AuthForm key={session} view={view} />}
        </div>
      </section>
    </div>
  )
}

// ── Account ───────────────────────────────────────────────────────────────────

function AccountPanel() {
  const { status, user } = useAuth()
  const { logOut, setView, closeDialog } = useAuthActions()
  const [pending, setPending] = useState(false)

  if (status === 'guest') {
    return (
      <Button size="lg" className="mt-7 w-full" onClick={() => setView('login')}>
        Log in
      </Button>
    )
  }

  const rows = user
    ? [
        { label: 'Name', value: user.name },
        { label: 'Email', value: user.email },
        { label: 'Phone', value: user.phone ?? 'Not added' },
      ]
    : []

  return (
    <div className="mt-6">
      {rows.length > 0 && (
        <dl className="divide-y divide-line border-y border-line">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-6 py-3.5">
              <dt className="ui shrink-0 text-sm text-ash">{row.label}</dt>
              <dd className="min-w-0 break-words text-right text-bone">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <Button
        variant="outline"
        size="lg"
        className="mt-7 w-full"
        disabled={pending}
        icon={<LogOut className="h-[1.05rem] w-[1.05rem]" aria-hidden="true" />}
        onClick={async () => {
          setPending(true)
          await logOut()
          setPending(false)
          closeDialog()
        }}
      >
        {pending ? 'Logging out…' : 'Log out'}
      </Button>
    </div>
  )
}

// ── Sign up / log in ──────────────────────────────────────────────────────────

type FieldName = 'name' | 'email' | 'phone' | 'password' | 'passwordConfirmation'
type Values = Record<FieldName, string>
type Errors = Partial<Record<FieldName, string>>

const EMPTY: Values = { name: '', email: '', phone: '', password: '', passwordConfirmation: '' }
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** Same pattern the API uses (App\Support\ValidationPatterns::PHONE). */
const PHONE = /^\+?[0-9][0-9\s\-()]{6,18}$/
/** The API's production rule: 10+ characters with letters and numbers (development accepts 8). */
const PASSWORD_HINT = 'At least 10 characters, with letters and numbers.'

function validate(view: 'signup' | 'login', v: Values): Errors {
  const errors: Errors = {}
  const signup = view === 'signup'
  if (signup && !v.name.trim()) errors.name = 'Tell us your name.'
  if (!v.email.trim()) errors.email = 'Enter your email address.'
  else if (!EMAIL.test(v.email.trim())) errors.email = 'That email address doesn’t look right.'
  if (signup && v.phone.trim() && !PHONE.test(v.phone.trim())) errors.phone = 'Use digits only, with an optional + at the start.'
  if (!v.password) errors.password = signup ? 'Choose a password.' : 'Enter your password.'
  else if (signup && (v.password.length < 10 || !/\p{L}/u.test(v.password) || !/\d/.test(v.password))) errors.password = PASSWORD_HINT
  if (signup && !errors.password && v.passwordConfirmation !== v.password) errors.passwordConfirmation = 'The passwords don’t match.'
  return errors
}

/** Maps the API's 422 field errors (snake_case keys) onto the form's fields. */
function fromServer(fieldErrors: Record<string, string[]>): Errors {
  const keys: Record<string, FieldName> = { name: 'name', email: 'email', phone: 'phone', password: 'password', password_confirmation: 'passwordConfirmation' }
  const errors: Errors = {}
  for (const [key, messages] of Object.entries(fieldErrors)) {
    const field = keys[key]
    if (field && messages[0]) errors[field] ??= messages[0]
  }
  return errors
}

function describe(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.'
  if (error.code === 'network_error') return `We can’t reach ${SITE.name} right now. Check your connection and try again.`
  if (error.status === 429) return 'Too many attempts. Wait a minute, then try again.'
  if (error.status >= 500) return 'Something went wrong on our side. Please try again in a moment.'
  return error.message
}

function AuthForm({ view }: { view: 'signup' | 'login' }) {
  const { signUp, logIn, setView, closeDialog } = useAuthActions()
  const [values, setValues] = useState<Values>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const form = useRef<HTMLFormElement>(null)
  const signup = view === 'signup'

  const focusSoon = (selector: string) => window.setTimeout(() => form.current?.querySelector<HTMLElement>(selector)?.focus(), 0)

  const field = (name: FieldName) => ({
    name,
    value: values[name],
    error: errors[name],
    onChange: (event: { currentTarget: HTMLInputElement }) => {
      const value = event.currentTarget.value
      setValues((v) => ({ ...v, [name]: value }))
      if (errors[name]) setErrors((e) => ({ ...e, [name]: undefined }))
    },
  })

  const switchTo = (next: 'signup' | 'login') => {
    setErrors({})
    setFormError(null)
    setValues((v) => ({ ...v, password: '', passwordConfirmation: '' }))
    setView(next)
    focusSoon('input')
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending) return
    const found = validate(view, values)
    setErrors(found)
    setFormError(null)
    if (Object.keys(found).length > 0) {
      focusSoon('[aria-invalid="true"]')
      return
    }

    setPending(true)
    try {
      if (signup) await signUp(values)
      else await logIn(values)
      setValues(EMPTY)
      closeDialog()
    } catch (error) {
      if (signup && error instanceof ApiError && error.code === 'validation_failed') {
        const server = fromServer(error.fieldErrors)
        if (Object.keys(server).length > 0) {
          setErrors(server)
          focusSoon('[aria-invalid="true"]')
        } else setFormError(error.message)
      } else {
        // Log-in failures ("These credentials do not match our records.") read better as one message.
        setFormError(describe(error))
        if (!signup) setValues((v) => ({ ...v, password: '' }))
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <form ref={form} noValidate onSubmit={submit} className="mt-5">
      <div className="space-y-4">
        {signup && <Field label="Full name" autoComplete="name" autoCapitalize="words" {...field('name')} />}
        <Field label="Email" type="email" autoComplete="email" autoCapitalize="off" spellCheck={false} inputMode="email" {...field('email')} />
        {signup && <Field label="Phone" optional="Optional, for order updates" type="tel" autoComplete="tel" inputMode="tel" {...field('phone')} />}
        <Field
          label="Password"
          type="password"
          autoComplete={signup ? 'new-password' : 'current-password'}
          hint={signup ? PASSWORD_HINT : undefined}
          {...field('password')}
        />
        {signup && <Field label="Confirm password" type="password" autoComplete="new-password" {...field('passwordConfirmation')} />}
      </div>

      <div role="alert">
        {formError && (
          <p className="ui mt-6 flex items-start gap-2.5 rounded-[3px] border border-ember/40 bg-ember/10 p-4 text-[0.9rem] leading-snug text-cream">
            <CircleAlert className="mt-px h-[1.1rem] w-[1.1rem] shrink-0 text-ember" aria-hidden="true" />
            {formError}
          </p>
        )}
      </div>

      <Button type="submit" size="lg" className="mt-6 w-full" disabled={pending}>
        {pending ? (signup ? 'Creating your account…' : 'Logging in…') : signup ? 'Create account' : 'Log in'}
      </Button>

      <p className="ui mt-5 text-center text-sm text-ash">
        {signup ? 'Already have an account?' : `New to ${SITE.name}?`}{' '}
        <button
          type="button"
          onClick={() => switchTo(signup ? 'login' : 'signup')}
          className="text-ember underline-offset-4 transition-colors hover:text-ember-hot hover:underline"
        >
          {signup ? 'Log in' : 'Create an account'}
        </button>
      </p>
    </form>
  )
}

interface FieldProps extends Omit<ComponentProps<'input'>, 'id'> {
  label: string
  hint?: string
  error?: string
  /** Text shown opposite the label, e.g. "Optional". */
  optional?: string
}

function Field({ label, hint, error, optional, type = 'text', className, ...rest }: FieldProps) {
  const id = useId()
  const [revealed, setRevealed] = useState(false)
  const isPassword = type === 'password'
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = (error ? errorId : hint ? hintId : '') || undefined

  return (
    <div className={className}>
      <label htmlFor={id} className="ui flex items-baseline justify-between gap-4 text-[0.8125rem] text-cream/85">
        {label}
        {optional && <span className="text-ash">{optional}</span>}
      </label>
      <div className="relative mt-2">
        <input
          id={id}
          type={isPassword && revealed ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'ui h-12 w-full rounded-[3px] border bg-ink px-4 text-[0.9375rem] text-bone transition-colors duration-200 focus:border-ember',
            error ? 'border-ember-hot' : 'border-line hover:border-cream/30',
            isPassword && 'pr-12',
          )}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            aria-label={`Show ${label.toLowerCase()}`}
            aria-pressed={revealed}
            className="absolute right-1 top-1 grid h-10 w-10 place-items-center rounded-[3px] text-ash transition-colors hover:text-ember"
          >
            {revealed ? <EyeOff className="h-[1.1rem] w-[1.1rem]" aria-hidden="true" /> : <Eye className="h-[1.1rem] w-[1.1rem]" aria-hidden="true" />}
          </button>
        )}
      </div>
      {error && (
        <p id={errorId} className="ui mt-2 flex items-start gap-1.5 text-[0.8125rem] leading-snug text-ember-hot">
          <CircleAlert className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-[0.875rem] text-ash">
          {hint}
        </p>
      )}
    </div>
  )
}
