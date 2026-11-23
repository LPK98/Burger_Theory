import { Eye, EyeOff, LockKeyhole, TriangleAlert } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { useAdminAuth } from '../auth-context'
import { Button, TextField } from '../components/ui'
import { BrandMark } from '../layout'
import { ApiError } from '../lib/api'

export function LoginPage() {
  const { status, logIn, notice } = useAdminAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})

  useEffect(() => {
    document.title = 'Log in | Burger Theory Admin'
  }, [])

  if (status === 'signed-in') return <Navigate to={from} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errors: typeof fieldErrors = {}
    if (!email.trim()) errors.email = 'Enter your email address.'
    if (!password) errors.password = 'Enter your password.'
    setFieldErrors(errors)
    setError(null)
    if (Object.keys(errors).length) return

    setPending(true)
    try {
      await logIn(email, password)
      navigate(from, { replace: true })
    } catch (err) {
      const apiError = ApiError.from(err)
      setError(apiError.field('email') ?? apiError.field('password') ?? apiError.message)
      setPassword('')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden border-r border-rule lg:block" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(40rem_32rem_at_30%_60%,rgb(234_95_23/0.22),transparent_65%)]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <BrandMark className="h-9 w-9" />
            <span className="title text-2xl text-bone">Burger Theory</span>
          </div>
          <div>
            <p className="title text-[clamp(4rem,8vw,7.5rem)] text-bone">
              Every order,
              <br />
              every bun,
              <br />
              every rupee.
            </p>
            <p className="mt-6 max-w-[40ch] text-base text-grey">The back office for the kitchen: orders on the pass, stock in the walk-in and takings at the till.</p>
          </div>
          <p className="text-xs text-dim">Restricted to Burger Theory administrators.</p>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-[24rem]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark className="h-9 w-9" />
            <span className="title text-2xl text-bone">Burger Theory</span>
          </div>
          <div className="mb-6 grid h-11 w-11 place-items-center rounded-xl border border-rule-strong bg-smoke text-ember">
            <LockKeyhole className="h-5 w-5" aria-hidden="true" />
          </div>
          <h1 className="title text-[2.75rem] text-bone">Admin login</h1>
          <p className="mt-2 text-sm text-grey">For staff with an administrator account. Customers sign in on the main site.</p>

          {(error || notice) && (
            <div role="alert" className={`mt-6 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${error ? 'border-bad/30 bg-bad/8 text-[#ffb1ab]' : 'border-rule-strong bg-smoke text-grey'}`}>
              {error && <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
              {error ?? notice}
            </div>
          )}

          <form noValidate onSubmit={submit} className="mt-6 space-y-4">
            <TextField
              label="Email"
              type="email"
              autoComplete="username"
              autoCapitalize="off"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={fieldErrors.email}
            />
            <div className="relative">
              <TextField
                label="Password"
                type={reveal ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={fieldErrors.password}
              />
              <button
                type="button"
                onClick={() => setReveal((r) => !r)}
                aria-label="Show password"
                aria-pressed={reveal}
                className="absolute right-1 top-[1.85rem] grid h-8 w-9 place-items-center rounded-md text-dim hover:text-bone"
              >
                {reveal ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
            <Button type="submit" variant="primary" className="w-full" loading={pending}>
              {pending ? 'Logging in…' : 'Log in'}
            </Button>
          </form>

          <p className="mt-8 text-[0.9375rem] text-dim">
            No account? Administrators are added by the owner with <code className="rounded bg-smoke px-1.5 py-0.5 text-grey">php artisan app:create-admin</code>.
          </p>
          <a href="/" className="mt-3 inline-block text-[0.9375rem] text-grey underline-offset-4 hover:text-ember hover:underline">
            Back to the Burger Theory site
          </a>
        </div>
      </section>
    </div>
  )
}
