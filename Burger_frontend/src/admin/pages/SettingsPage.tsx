import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleCheck, CircleDashed, ImagePlus, Trash } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { cn } from '../../lib/utils'
import { useConfirm, useToast } from '../components/overlay-context'
import { Button, Card, CardHeader, ErrorState, Notice, Skeleton, Switch, TextField } from '../components/ui'
import { PageHeader } from '../layout'
import { ApiError, errorMessage } from '../lib/api'
import { settings as settingsApi } from '../lib/endpoints'
import { centsToDollars, dollarsToCents } from '../lib/format'
import type { Settings, SettingsResponse } from '../lib/types'

export default function SettingsPage() {
  // No refetch on focus: the form holds unsaved edits.
  const query = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get, refetchOnWindowFocus: false })
  return (
    <>
      <PageHeader title="Settings" description={
          <>
            The restaurant’s details and ordering rules. Changes apply to the website straight away. Opening hours, holidays and closures are on{' '}
            <Link to="/hours" className="text-ember-hot underline-offset-2 hover:underline">
              Opening hours
            </Link>
            .
          </>
        } />
      {query.isError ? (
        <Card>
          <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
        </Card>
      ) : !query.data ? (
        <div className="space-y-3">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      ) : (
        <SettingsForm response={query.data} />
      )}
    </>
  )
}

interface FormState {
  restaurant_name: string
  contact_phone: string
  contact_email: string
  address_line1: string
  address_line2: string
  city: string
  postal_code: string
  instagram_url: string
  facebook_url: string
  accepting_orders: boolean
  delivery_enabled: boolean
  pickup_enabled: boolean
  cod_enabled: boolean
  payhere_enabled: boolean
  stripe_enabled: boolean
  delivery_fee: string
  free_delivery_threshold: string
  minimum_order_amount: string
  estimated_preparation_minutes: string
}

function toForm(s: Settings): FormState {
  return {
    restaurant_name: s.restaurant_name,
    contact_phone: s.contact_phone ?? '',
    contact_email: s.contact_email ?? '',
    address_line1: s.address_line1 ?? '',
    address_line2: s.address_line2 ?? '',
    city: s.city ?? '',
    postal_code: s.postal_code ?? '',
    instagram_url: s.instagram_url ?? '',
    facebook_url: s.facebook_url ?? '',
    accepting_orders: s.accepting_orders,
    delivery_enabled: s.delivery_enabled,
    pickup_enabled: s.pickup_enabled,
    cod_enabled: s.cod_enabled,
    payhere_enabled: s.payhere_enabled,
    stripe_enabled: s.stripe_enabled,
    delivery_fee: centsToDollars(s.delivery_fee),
    free_delivery_threshold: centsToDollars(s.free_delivery_threshold),
    minimum_order_amount: centsToDollars(s.minimum_order_amount),
    estimated_preparation_minutes: String(s.estimated_preparation_minutes),
  }
}

function SettingsForm({ response }: { response: SettingsResponse }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const initial = toForm(response.data)
  const [form, setForm] = useState<FormState>(initial)
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const integrations = response.meta.integrations
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => ({ ...e, [k]: undefined }))
  }

  const save = useMutation({
    mutationFn: (changes: Partial<Settings>) => settingsApi.update(changes),
    onSuccess: (res) => {
      queryClient.setQueryData(['settings'], res)
      toast.success('Settings saved.')
    },
    onError: (e) => {
      const err = ApiError.from(e)
      if (err.code !== 'validation_failed') return toast.error(err.message)
      setErrors(Object.fromEntries(Object.keys(err.fieldErrors).map((k) => [k, err.field(k)])))
      toast.error('Check the highlighted fields.')
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const found: Record<string, string> = {}
    if (form.restaurant_name.trim().length < 2) found.restaurant_name = 'Enter the restaurant’s name.'
    const fee = dollarsToCents(form.delivery_fee)
    if (fee === null) found.delivery_fee = 'Enter an amount in rupees (0 for free).'
    const minimum = dollarsToCents(form.minimum_order_amount)
    if (minimum === null) found.minimum_order_amount = 'Enter an amount in rupees (0 for none).'
    const threshold = form.free_delivery_threshold.trim() ? dollarsToCents(form.free_delivery_threshold) : null
    if (form.free_delivery_threshold.trim() && threshold === null) found.free_delivery_threshold = 'Enter an amount in rupees, or leave it blank.'
    const prep = Number(form.estimated_preparation_minutes)
    if (!Number.isInteger(prep) || prep < 1 || prep > 600) found.estimated_preparation_minutes = 'Enter minutes between 1 and 600.'
    if (!form.delivery_enabled && !form.pickup_enabled) found.pickup_enabled = 'Keep delivery or pickup switched on, or customers can’t order.'
    // Same rule as the API: an https link on the network's own domain.
    const link = (k: 'instagram_url' | 'facebook_url', host: RegExp, name: string) => {
      const v = form[k].trim()
      if (v && !host.test(v)) found[k] = `Paste the full https:// link to the ${name} page.`
    }
    link('instagram_url', /^https:\/\/([a-z0-9-]+\.)*instagram\.com(\/|$)/i, 'Instagram')
    link('facebook_url', /^https:\/\/([a-z0-9-]+\.)*(facebook|fb)\.com(\/|$)/i, 'Facebook')
    if (!form.cod_enabled && !form.payhere_enabled && !form.stripe_enabled) found.cod_enabled = 'Keep at least one payment method switched on.'
    setErrors(found)
    if (Object.keys(found).length) return toast.error('Check the highlighted fields.')

    save.mutate({
      restaurant_name: form.restaurant_name.trim(),
      contact_phone: form.contact_phone.trim() || null,
      contact_email: form.contact_email.trim() || null,
      address_line1: form.address_line1.trim() || null,
      address_line2: form.address_line2.trim() || null,
      city: form.city.trim() || null,
      postal_code: form.postal_code.trim() || null,
      instagram_url: form.instagram_url.trim() || null,
      facebook_url: form.facebook_url.trim() || null,
      accepting_orders: form.accepting_orders,
      delivery_enabled: form.delivery_enabled,
      pickup_enabled: form.pickup_enabled,
      cod_enabled: form.cod_enabled,
      payhere_enabled: form.payhere_enabled,
      stripe_enabled: form.stripe_enabled,
      delivery_fee: fee!,
      free_delivery_threshold: threshold,
      minimum_order_amount: minimum!,
      estimated_preparation_minutes: prep,
    })
  }

  return (
    <form noValidate onSubmit={submit} className="space-y-4 pb-20">
      {!form.accepting_orders && <Notice tone="warn">The website isn’t taking orders. Customers can browse but can’t check out.</Notice>}

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Card aria-labelledby="s-profile">
          <CardHeader id="s-profile" title="Restaurant" description="Shown on the website (contact section, footer, Find us card, mobile menu), receipts and emails. Leave a field blank to hide it." />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <TextField label="Name" className="sm:col-span-2" value={form.restaurant_name} maxLength={80} onChange={(e) => update('restaurant_name', e.target.value)} error={errors.restaurant_name} />
            <TextField label="Phone" optional type="tel" value={form.contact_phone} onChange={(e) => update('contact_phone', e.target.value)} error={errors.contact_phone} placeholder="+94 11 234 5678" />
            <TextField label="Email" optional type="email" value={form.contact_email} onChange={(e) => update('contact_email', e.target.value)} error={errors.contact_email} placeholder="hello@burgertheory.lk" />
            <TextField label="Address" optional className="sm:col-span-2" value={form.address_line1} onChange={(e) => update('address_line1', e.target.value)} error={errors.address_line1} placeholder="Street and number" />
            <TextField label="Address line 2" optional className="sm:col-span-2" value={form.address_line2} onChange={(e) => update('address_line2', e.target.value)} error={errors.address_line2} />
            <TextField label="City" optional value={form.city} onChange={(e) => update('city', e.target.value)} error={errors.city} />
            <TextField label="Postal code" optional value={form.postal_code} onChange={(e) => update('postal_code', e.target.value)} error={errors.postal_code} />
            <TextField label="Instagram" optional type="url" inputMode="url" value={form.instagram_url} maxLength={255} onChange={(e) => update('instagram_url', e.target.value)} error={errors.instagram_url} placeholder="https://www.instagram.com/burgertheory" />
            <TextField label="Facebook" optional type="url" inputMode="url" value={form.facebook_url} maxLength={255} onChange={(e) => update('facebook_url', e.target.value)} error={errors.facebook_url} placeholder="https://www.facebook.com/burgertheory" />
          </div>
        </Card>
        <LogoCard logoUrl={response.data.logo_url} cloudinary={integrations.cloudinary} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card aria-labelledby="s-ordering">
          <CardHeader id="s-ordering" title="Ordering" />
          <div className="space-y-5 p-5">
            <Switch checked={form.accepting_orders} onChange={(v) => update('accepting_orders', v)} label="Taking orders" description="Switch off to pause online ordering, e.g. when the kitchen is full." />
            <Switch checked={form.delivery_enabled} onChange={(v) => update('delivery_enabled', v)} label="Delivery" />
            <Switch checked={form.pickup_enabled} onChange={(v) => update('pickup_enabled', v)} label="Pickup" />
            {errors.pickup_enabled && <p className="text-[0.8125rem] text-[#ff8a83]">{errors.pickup_enabled}</p>}
            <div className="grid gap-4 border-t border-rule pt-5 sm:grid-cols-2">
              <TextField label="Delivery charge" prefix="$" inputMode="decimal" value={form.delivery_fee} onChange={(e) => update('delivery_fee', e.target.value)} error={errors.delivery_fee} />
              <TextField label="Free delivery from" optional prefix="$" inputMode="decimal" value={form.free_delivery_threshold} onChange={(e) => update('free_delivery_threshold', e.target.value)} error={errors.free_delivery_threshold} hint="Order total after discounts. Blank means never free." />
              <TextField label="Minimum order" prefix="$" inputMode="decimal" value={form.minimum_order_amount} onChange={(e) => update('minimum_order_amount', e.target.value)} error={errors.minimum_order_amount} hint="Subtotal before delivery." />
              <TextField label="Preparation time" inputMode="numeric" value={form.estimated_preparation_minutes} onChange={(e) => update('estimated_preparation_minutes', e.target.value)} error={errors.estimated_preparation_minutes} hint="Minutes, used for ready-by estimates." />
            </div>
          </div>
        </Card>

        <Card aria-labelledby="s-payments">
          <CardHeader id="s-payments" title="Payments" />
          <div className="space-y-5 p-5">
            <Switch checked={form.cod_enabled} onChange={(v) => update('cod_enabled', v)} label="Cash on delivery" description="Staff record the cash when it’s collected." />
            <Switch
              checked={form.stripe_enabled}
              onChange={(v) => update('stripe_enabled', v)}
              label="Stripe card payments"
              description={
                integrations.stripe
                  ? `Connected${integrations.stripe_test_mode ? ' with a test key (no real charges)' : ' with a live key'}.${integrations.stripe_webhook ? '' : ' The webhook signing secret is missing, so payments are confirmed only when customers return to the site.'}`
                  : 'Not connected: customers won’t see it until STRIPE_SECRET_KEY is set on the server.'
              }
            />
            <Switch
              checked={form.payhere_enabled}
              onChange={(v) => update('payhere_enabled', v)}
              label="PayHere card payments"
              description={integrations.payhere ? `Connected${integrations.payhere_sandbox ? ' to the sandbox (test payments)' : ' to the live account'}.` : 'Not connected: customers won’t see it until PAYHERE_MERCHANT_ID and PAYHERE_MERCHANT_SECRET are set on the server.'}
            />
            {errors.cod_enabled && <p className="text-[0.8125rem] text-[#ff8a83]">{errors.cod_enabled}</p>}
            <div className="space-y-2 border-t border-rule pt-5 text-sm">
              <p className="text-xs font-medium text-dim">Server connections</p>
              <Integration ok={integrations.stripe && integrations.stripe_webhook} label="Stripe" detail={integrations.stripe ? `${integrations.stripe_test_mode ? 'Test mode' : 'Live'}${integrations.stripe_webhook ? '' : ', webhook secret missing'}` : 'Not configured'} />
              <Integration ok={integrations.payhere} label="PayHere" detail={integrations.payhere ? (integrations.payhere_sandbox ? 'Sandbox' : 'Live') : 'Not configured'} />
              <Integration ok={integrations.cloudinary} label="Cloudinary (photos)" detail={integrations.cloudinary ? 'Configured' : 'Not configured'} />
              <p className="pt-1 text-xs text-dim">
                Currency {integrations.currency}, timezone {integrations.timezone}. Online payments are confirmed only by the server: from Stripe’s signed webhooks (or Stripe’s API) and PayHere’s signed notifications.
              </p>
            </div>
          </div>
        </Card>
      </div>

      <div className={cn('fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-pitch/90 backdrop-blur-xl transition-[transform,visibility] duration-300 lg:left-64', dirty ? 'visible translate-y-0' : 'invisible translate-y-full')} aria-hidden={!dirty}>
        <div className="mx-auto flex max-w-[90rem] items-center justify-end gap-3 px-4 py-3 sm:px-6 lg:px-10">
          <p className="mr-auto text-sm text-grey">You have unsaved changes.</p>
          <Button tabIndex={dirty ? 0 : -1} onClick={() => {
              setForm(initial)
              setErrors({})
            }}>
            Discard
          </Button>
          <Button tabIndex={dirty ? 0 : -1} type="submit" variant="primary" loading={save.isPending}>
            Save changes
          </Button>
        </div>
      </div>
    </form>
  )
}

function Integration({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <p className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-bone">
        {ok ? <CircleCheck className="h-4 w-4 text-good" aria-hidden="true" /> : <CircleDashed className="h-4 w-4 text-dim" aria-hidden="true" />}
        {label}
      </span>
      <span className={ok ? 'text-grey' : 'text-dim'}>{detail}</span>
    </p>
  )
}

function LogoCard({ logoUrl, cloudinary }: { logoUrl: string | null; cloudinary: boolean }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const input = useRef<HTMLInputElement>(null)
  const upload = useMutation({
    mutationFn: settingsApi.uploadLogo,
    onSuccess: (res) => {
      queryClient.setQueryData(['settings'], res)
      toast.success('Logo updated.')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const remove = useMutation({
    mutationFn: settingsApi.removeLogo,
    onSuccess: (res) => {
      queryClient.setQueryData(['settings'], res)
      toast.success('Logo removed.')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  return (
    <Card aria-labelledby="s-logo">
      <CardHeader id="s-logo" title="Logo" description="JPG, PNG or WebP up to 2 MB." />
      <div className="space-y-4 p-5">
        <div className="grid h-36 place-items-center rounded-xl border border-dashed border-rule-strong bg-pitch/50">
          {logoUrl ? <img src={logoUrl} alt="Current logo" className="max-h-28 max-w-[80%] object-contain" /> : <p className="text-sm text-dim">No logo uploaded</p>}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            if (f.size > 2 * 1024 * 1024) return toast.error('That file is over 2 MB.')
            upload.mutate(f)
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button icon={<ImagePlus className="h-4 w-4" aria-hidden="true" />} disabled={!cloudinary} loading={upload.isPending} onClick={() => input.current?.click()}>
            {logoUrl ? 'Replace logo' : 'Upload logo'}
          </Button>
          {logoUrl && (
            <Button
              variant="ghost"
              icon={<Trash className="h-4 w-4" aria-hidden="true" />}
              loading={remove.isPending}
              onClick={async () => {
                if (await confirm({ title: 'Remove the logo?', confirmLabel: 'Remove logo' })) remove.mutate()
              }}
            >
              Remove
            </Button>
          )}
        </div>
        {!cloudinary && <p className="text-[0.8125rem] text-dim">Uploads need Cloudinary credentials in the backend’s .env file.</p>}
      </div>
    </Card>
  )
}
