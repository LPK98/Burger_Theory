import { useMutation } from '@tanstack/react-query'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useAdminAuth } from '../auth-context'
import { useToast } from '../components/overlay-context'
import { Button, Card, CardHeader, TextField } from '../components/ui'
import { PageHeader } from '../layout'
import { ApiError } from '../lib/api'
import { auth } from '../lib/endpoints'
import { date } from '../lib/format'

export default function ProfilePage() {
  const { user, setUser } = useAdminAuth()
  const toast = useToast()
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})

  const save = useMutation({
    mutationFn: () => auth.updateProfile({ name: name.trim(), email: email.trim(), phone: phone.trim() || null }),
    onSuccess: (u) => {
      setUser(u)
      toast.success('Profile saved.')
    },
    onError: (e) => {
      const err = ApiError.from(e)
      if (err.code !== 'validation_failed') return toast.error(err.message)
      setErrors({ name: err.field('name'), email: err.field('email'), phone: err.field('phone') })
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const found: Record<string, string> = {}
    if (!name.trim()) found.name = 'Enter your name.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) found.email = 'Enter a valid email address.'
    setErrors(found)
    if (!Object.keys(found).length) save.mutate()
  }

  return (
    <>
      <PageHeader title="Profile" description="Your administrator account." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card aria-labelledby="p-details">
          <CardHeader
            id="p-details"
            title="Your details"
            description={
              user && (
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-good" aria-hidden="true" />
                  Administrator since {date(user.created_at)}
                </span>
              )
            }
          />
          <form noValidate onSubmit={submit} className="space-y-4 p-5">
            <TextField label="Name" value={name} maxLength={120} autoComplete="name" onChange={(e) => setName(e.target.value)} error={errors.name} />
            <TextField label="Email" type="email" value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} error={errors.email} hint="You log in with this address." />
            <TextField label="Phone" optional type="tel" value={phone} autoComplete="tel" onChange={(e) => setPhone(e.target.value)} error={errors.phone} />
            <div className="flex justify-end">
              <Button type="submit" variant="primary" loading={save.isPending}>
                Save profile
              </Button>
            </div>
          </form>
        </Card>
        <PasswordCard />
      </div>
    </>
  )
}

function PasswordCard() {
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})

  const save = useMutation({
    mutationFn: () => auth.changePassword(current, next, confirm),
    onSuccess: () => {
      setCurrent('')
      setNext('')
      setConfirm('')
      toast.success('Password changed.')
    },
    onError: (e) => {
      const err = ApiError.from(e)
      if (err.code !== 'validation_failed') return toast.error(err.message)
      setErrors({ current: err.field('current_password'), next: err.field('password') })
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const found: Record<string, string> = {}
    if (!current) found.current = 'Enter your current password.'
    if (next.length < 10 || !/\p{L}/u.test(next) || !/\d/.test(next)) found.next = 'Use at least 10 characters, with letters and numbers.'
    else if (next !== confirm) found.confirm = 'The new passwords don’t match.'
    setErrors(found)
    if (!Object.keys(found).length) save.mutate()
  }

  return (
    <Card aria-labelledby="p-password">
      <CardHeader id="p-password" title="Password" description="Other devices stay signed in until their sessions expire." />
      <form noValidate onSubmit={submit} className="space-y-4 p-5">
        <TextField label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} error={errors.current} />
        <TextField label="New password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} error={errors.next} hint="At least 10 characters, with letters and numbers." />
        <TextField label="Confirm new password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
        <div className="flex justify-end">
          <Button type="submit" icon={<KeyRound className="h-4 w-4" aria-hidden="true" />} loading={save.isPending}>
            Change password
          </Button>
        </div>
      </form>
    </Card>
  )
}
