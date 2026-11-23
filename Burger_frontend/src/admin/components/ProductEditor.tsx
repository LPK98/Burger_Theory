import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ImagePlus, Info, Plus, Star, Trash, X } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { cn } from '../../lib/utils'
import { ApiError, errorMessage } from '../lib/api'
import { categories as categoriesApi, inventory, products, settings } from '../lib/endpoints'
import { centsToRupees, dateTime, rupeesToCents } from '../lib/format'
import type { Product, ProductInput } from '../lib/types'
import { Drawer } from './overlay'
import { useConfirm, useToast } from './overlay-context'
import { StockBadge } from './status'
import { Button, IconButton, Notice, SelectField, Skeleton, Switch, TextArea, TextField } from './ui'

interface Form {
  name: string
  description: string
  price: string
  compare_at_price: string
  badge: string
  is_available: boolean
  is_featured: boolean
  track_stock: boolean
  stock_quantity: string
  low_stock_threshold: string
  sort_order: string
  category_ids: number[]
}

const BLANK: Form = {
  name: '',
  description: '',
  price: '',
  compare_at_price: '',
  badge: '',
  is_available: true,
  is_featured: false,
  track_stock: true,
  stock_quantity: '0',
  low_stock_threshold: '5',
  sort_order: '0',
  category_ids: [],
}

function toForm(p: Product): Form {
  return {
    name: p.name,
    description: p.description ?? '',
    price: centsToRupees(p.price),
    compare_at_price: centsToRupees(p.compare_at_price),
    badge: p.badge ?? '',
    is_available: p.is_available,
    is_featured: p.is_featured,
    track_stock: p.track_stock,
    stock_quantity: String(p.stock_quantity),
    low_stock_threshold: String(p.low_stock_threshold),
    sort_order: String(p.sort_order),
    category_ids: p.categories.map((c) => c.id),
  }
}

type Errors = Partial<Record<keyof Form, string>>

/** Create (productId = 'new') or edit a product. After creating, it switches to editing so images and the recipe can be added. */
export function ProductEditor({ productId, onClose, onCreated }: { productId: number | 'new' | null; onClose: () => void; onCreated: (id: number) => void }) {
  const editing = typeof productId === 'number'
  const query = useQuery({ queryKey: ['product', productId], queryFn: () => products.get(productId as number), enabled: editing })
  const product = query.data
  const title = productId === 'new' ? 'New product' : (product?.name ?? 'Product')

  return (
    <Drawer open={productId !== null} onClose={onClose} title={title} width="lg" description={product && <span className="text-dim">/{product.slug}, updated {dateTime(product.updated_at)}</span>}>
      {productId === 'new' ? (
        <DetailsForm key="new" initial={BLANK} onSaved={(p) => onCreated(p.id)} />
      ) : !product ? (
        <div className="space-y-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <div className="space-y-10">
          <DetailsForm key={product.id} initial={toForm(product)} product={product} />
          <ImagesSection product={product} />
          <StockSection product={product} />
          <RecipeSection key={`recipe-${product.id}`} product={product} />
          <p className="flex items-start gap-2 rounded-xl border border-rule bg-pitch/40 px-4 py-3 text-[0.9375rem] text-grey">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-dim" aria-hidden="true" />
            Variations and add-ons aren’t available yet. The website and checkout sell each burger as one fixed item, so options set here would have nowhere to appear.
          </p>
        </div>
      )}
    </Drawer>
  )
}

function DetailsForm({ initial, product, onSaved }: { initial: Form; product?: Product; onSaved?: (p: Product) => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState<Form>(initial)
  const [errors, setErrors] = useState<Errors>({})
  const cats = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list })
  const update = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const save = useMutation({
    mutationFn: (input: ProductInput) => (product ? products.update(product.id, input) : products.create(input)),
    onSuccess: (saved) => {
      queryClient.setQueryData(['product', saved.id], saved)
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      toast.success(product ? `Saved ${saved.name}.` : `Added ${saved.name}. Now add a photo and its recipe.`)
      onSaved?.(saved)
    },
    onError: (error) => {
      const e = ApiError.from(error)
      if (e.code === 'validation_failed') {
        setErrors({
          name: e.field('name') ?? e.field('slug'),
          price: e.field('price'),
          compare_at_price: e.field('compare_at_price'),
          badge: e.field('badge'),
          description: e.field('description'),
          category_ids: e.field('category_ids') ?? e.field('category_ids.0'),
          stock_quantity: e.field('stock_quantity'),
          low_stock_threshold: e.field('low_stock_threshold'),
        })
      }
      toast.error(e.code === 'validation_failed' ? 'Check the highlighted fields.' : e.message)
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const found: Errors = {}
    const price = rupeesToCents(form.price)
    const compare = form.compare_at_price.trim() ? rupeesToCents(form.compare_at_price) : null
    if (!form.name.trim()) found.name = 'Give the product a name.'
    if (price === null) found.price = 'Enter a price in rupees, e.g. 1450 or 1450.50.'
    if (form.compare_at_price.trim() && compare === null) found.compare_at_price = 'Enter a price in rupees.'
    else if (compare !== null && price !== null && compare <= price) found.compare_at_price = 'The original price must be higher than the price.'
    if (form.category_ids.length === 0) found.category_ids = 'Choose at least one category.'
    const threshold = Number(form.low_stock_threshold)
    if (!Number.isInteger(threshold) || threshold < 0) found.low_stock_threshold = 'Use a whole number, 0 or more.'
    const opening = Number(form.stock_quantity)
    if (!product && form.track_stock && (!Number.isInteger(opening) || opening < 0)) found.stock_quantity = 'Use a whole number, 0 or more.'
    setErrors(found)
    if (Object.keys(found).length) return

    save.mutate({
      name: form.name.trim(),
      description: form.description.trim() || null,
      price: price!,
      compare_at_price: compare,
      badge: form.badge.trim() || null,
      is_available: form.is_available,
      is_featured: form.is_featured,
      track_stock: form.track_stock,
      ...(product ? {} : { stock_quantity: form.track_stock ? opening : 0 }),
      low_stock_threshold: threshold,
      sort_order: Number(form.sort_order) || 0,
      category_ids: form.category_ids,
    })
  }

  return (
    <form noValidate onSubmit={submit} aria-label="Product details" className="space-y-5">
      <h3 className="text-[1.0625rem] font-semibold text-bone">Details</h3>
      <TextField label="Name" value={form.name} onChange={(e) => update('name', e.target.value)} error={errors.name} maxLength={120} />
      <TextArea label="Description" optional value={form.description} onChange={(e) => update('description', e.target.value)} error={errors.description} maxLength={2000} rows={3} />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="Price" prefix="Rs" inputMode="decimal" value={form.price} onChange={(e) => update('price', e.target.value)} error={errors.price} placeholder="1450" />
        <TextField
          label="Original price"
          optional
          prefix="Rs"
          inputMode="decimal"
          value={form.compare_at_price}
          onChange={(e) => update('compare_at_price', e.target.value)}
          error={errors.compare_at_price}
          hint="Shown struck through when on offer."
        />
        <TextField label="Badge" optional value={form.badge} onChange={(e) => update('badge', e.target.value)} error={errors.badge} maxLength={40} placeholder="Signature" />
      </div>

      <fieldset>
        <legend className="mb-2 text-[0.9375rem] font-medium text-bone/85">Categories</legend>
        {!cats.data ? (
          <Skeleton className="h-9" />
        ) : (
          <div className="flex flex-wrap gap-2">
            {cats.data.map((c) => {
              const on = form.category_ids.includes(c.id)
              return (
                <label
                  key={c.id}
                  className={cn('inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm transition-colors', on ? 'border-ember/60 bg-ember/12 text-bone' : 'border-rule-strong text-grey hover:text-bone')}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    onChange={() => update('category_ids', on ? form.category_ids.filter((id) => id !== c.id) : [...form.category_ids, c.id])}
                  />
                  <span className={cn('h-3.5 w-3.5 rounded border', on ? 'border-ember bg-ember' : 'border-rule-strong')} aria-hidden="true" />
                  {c.name}
                  {!c.is_active && <span className="text-xs text-dim">(hidden)</span>}
                </label>
              )
            })}
          </div>
        )}
        {errors.category_ids && <p className="mt-1.5 text-[0.9375rem] text-[#ff8a83]">{errors.category_ids}</p>}
      </fieldset>

      <div className="space-y-4 rounded-xl border border-rule bg-pitch/40 p-4">
        <Switch checked={form.is_available} onChange={(v) => update('is_available', v)} label="On the menu" description="Customers can see and order it." />
        <Switch checked={form.is_featured} onChange={(v) => update('is_featured', v)} label="Featured" description="Highlighted on the website." />
        <Switch checked={form.track_stock} onChange={(v) => update('track_stock', v)} label="Limit how many can be sold" description="Off means made to order with no limit." />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {!product && form.track_stock && (
          <TextField label="Opening stock" type="number" min={0} inputMode="numeric" value={form.stock_quantity} onChange={(e) => update('stock_quantity', e.target.value)} error={errors.stock_quantity} />
        )}
        {form.track_stock && (
          <TextField label="Low-stock warning at" type="number" min={0} inputMode="numeric" value={form.low_stock_threshold} onChange={(e) => update('low_stock_threshold', e.target.value)} error={errors.low_stock_threshold} />
        )}
        <TextField label="Menu position" type="number" min={0} inputMode="numeric" value={form.sort_order} onChange={(e) => update('sort_order', e.target.value)} hint="Lower numbers come first." />
      </div>

      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={save.isPending}>
          {product ? 'Save changes' : 'Add product'}
        </Button>
      </div>
    </form>
  )
}

function ImagesSection({ product }: { product: Product }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const file = useRef<HTMLInputElement>(null)
  const config = useQuery({ queryKey: ['settings'], queryFn: settings.get, staleTime: 300_000 })
  const cloudinary = config.data?.meta.integrations.cloudinary
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['product', product.id] })
    queryClient.invalidateQueries({ queryKey: ['products'] })
  }

  const upload = useMutation({
    mutationFn: (f: File) => products.uploadImage(product.id, f, product.name),
    onSuccess: () => {
      refresh()
      toast.success('Photo uploaded.')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const primary = useMutation({ mutationFn: (imageId: number) => products.makePrimary(product.id, imageId), onSuccess: refresh, onError: (e) => toast.error(errorMessage(e)) })
  const remove = useMutation({
    mutationFn: (imageId: number) => products.deleteImage(product.id, imageId),
    onSuccess: () => {
      refresh()
      toast.success('Photo deleted.')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  return (
    <section aria-labelledby="images-title" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 id="images-title" className="text-[1.0625rem] font-semibold text-bone">
            Photos
          </h3>
          <p className="text-[0.9375rem] text-dim">JPG, PNG or WebP up to 5 MB, stored on Cloudinary. The starred photo is shown on the menu.</p>
        </div>
        <input
          ref={file}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            if (f.size > 5 * 1024 * 1024) return toast.error('That file is over 5 MB.')
            upload.mutate(f)
          }}
        />
        <Button icon={<ImagePlus className="h-4 w-4" aria-hidden="true" />} loading={upload.isPending} disabled={cloudinary === false} onClick={() => file.current?.click()}>
          Upload photo
        </Button>
      </div>
      {cloudinary === false && (
        <Notice tone="warn">
          Photo uploads need Cloudinary. Add <code className="text-bone">CLOUDINARY_CLOUD_NAME</code>, <code className="text-bone">CLOUDINARY_API_KEY</code> and <code className="text-bone">CLOUDINARY_API_SECRET</code> to the backend’s .env file.
        </Notice>
      )}
      {product.images.length === 0 ? (
        <p className="rounded-xl border border-dashed border-rule-strong px-4 py-8 text-center text-sm text-dim">No photos yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {product.images.map((img) => (
            <li key={img.id} className={cn('group relative overflow-hidden rounded-xl border bg-pitch', img.is_primary ? 'border-ember/60' : 'border-rule')}>
              <img src={img.url} alt={img.alt ?? ''} className="aspect-square w-full object-contain p-2" />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent p-2">
                <IconButton
                  label={img.is_primary ? 'Menu photo' : 'Use as menu photo'}
                  disabled={img.is_primary || primary.isPending}
                  onClick={() => primary.mutate(img.id)}
                  className={cn('h-8 w-8', img.is_primary ? 'text-ember disabled:opacity-100' : 'text-bone')}
                >
                  <Star className={cn('h-4 w-4', img.is_primary && 'fill-ember')} aria-hidden="true" />
                </IconButton>
                <IconButton
                  label="Delete photo"
                  className="h-8 w-8 text-bone hover:text-[#ff8a83]"
                  onClick={async () => {
                    if (await confirm({ title: 'Delete this photo?', body: 'It’s removed from the menu and from Cloudinary.', confirmLabel: 'Delete photo' })) remove.mutate(img.id)
                  }}
                >
                  <Trash className="h-4 w-4" aria-hidden="true" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function StockSection({ product }: { product: Product }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [mode, setMode] = useState<'restock' | 'adjustment'>('restock')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string>()
  const log = useQuery({ queryKey: ['product', product.id, 'stock'], queryFn: () => products.stockLog(product.id), enabled: product.track_stock })

  const adjust = useMutation({
    mutationFn: () => {
      const n = Number(amount)
      return products.adjustStock(product.id, mode === 'restock' ? { change: n, reason: 'restock', note: note || undefined } : { set_to: n, reason: 'adjustment', note: note || undefined })
    },
    onSuccess: () => {
      setAmount('')
      setNote('')
      queryClient.invalidateQueries({ queryKey: ['product', product.id] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Stock updated.')
    },
    onError: (e) => {
      const err = ApiError.from(e)
      setError(err.field('change') ?? err.field('set_to') ?? err.message)
    },
  })

  if (!product.track_stock) return null

  return (
    <section aria-labelledby="stock-title" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 id="stock-title" className="text-[1.0625rem] font-semibold text-bone">
          Burgers available to sell
        </h3>
        <div className="flex items-center gap-3">
          <span className="tabular text-2xl font-semibold text-bone">{product.stock_quantity}</span>
          <StockBadge status={product.stock_status} />
        </div>
      </div>
      <form
        noValidate
        className="grid gap-3 rounded-xl border border-rule bg-pitch/40 p-4 sm:grid-cols-[auto_8rem_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault()
          const n = Number(amount)
          if (!amount || !Number.isInteger(n) || (mode === 'restock' ? n <= 0 : n < 0)) return setError(mode === 'restock' ? 'Enter how many to add.' : 'Enter the counted amount.')
          setError(undefined)
          adjust.mutate()
        }}
      >
        <SelectField label="Change" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
          <option value="restock">Add stock</option>
          <option value="adjustment">Set counted stock</option>
        </SelectField>
        <TextField label={mode === 'restock' ? 'Add' : 'Counted'} type="number" min={0} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <TextField label="Note" optional value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Morning prep" />
        <Button type="submit" loading={adjust.isPending}>
          Update stock
        </Button>
        {error && <p className="text-[0.9375rem] text-[#ff8a83] sm:col-span-4">{error}</p>}
      </form>
      {log.data && log.data.data.length > 0 && (
        <ul className="divide-y divide-rule/70 text-sm">
          {log.data.data.slice(0, 6).map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 py-2">
              <span className="text-grey">
                {l.reason === 'sale' ? `Sold in ${l.order_number ?? 'an order'}` : l.reason === 'order_release' ? `Returned from ${l.order_number ?? 'an order'}` : l.reason === 'restock' ? 'Restocked' : 'Stock count'}
                {l.note && <span className="text-dim"> “{l.note}”</span>}
                <span className="block text-xs text-dim">{dateTime(l.created_at)}{l.user ? `, ${l.user}` : ''}</span>
              </span>
              <span className={cn('tabular shrink-0 font-medium', l.change > 0 ? 'text-[#6fd981]' : 'text-grey')}>
                {l.change > 0 ? '+' : ''}
                {l.change} <span className="text-dim">→ {l.quantity_after}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function RecipeSection({ product }: { product: Product }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const ingredients = useQuery({ queryKey: ['ingredients', 'all'], queryFn: () => inventory.list({ sort: 'name' }) })
  const [rows, setRows] = useState(() => (product.recipe ?? []).map((r) => ({ ingredient_id: String(r.ingredient_id), quantity: String(r.quantity) })))
  const [error, setError] = useState<string>()
  const byId = new Map((ingredients.data ?? []).map((i) => [String(i.id), i]))

  const save = useMutation({
    mutationFn: () => products.saveRecipe(product.id, rows.filter((r) => r.ingredient_id).map((r) => ({ ingredient_id: Number(r.ingredient_id), quantity: Number(r.quantity) }))),
    onSuccess: (saved) => {
      queryClient.setQueryData(['product', saved.id], saved)
      queryClient.invalidateQueries({ queryKey: ['ingredients'] })
      toast.success(`Recipe saved for ${saved.name}.`)
    },
    onError: (e) => setError(errorMessage(e)),
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const used = rows.filter((r) => r.ingredient_id)
    if (used.some((r) => !(Number(r.quantity) > 0))) return setError('Every ingredient needs an amount above zero.')
    if (new Set(used.map((r) => r.ingredient_id)).size !== used.length) return setError('Each ingredient can appear once.')
    setError(undefined)
    save.mutate()
  }

  return (
    <form noValidate onSubmit={submit} aria-labelledby="recipe-title" className="space-y-4">
      <div>
        <h3 id="recipe-title" className="text-[1.0625rem] font-semibold text-bone">
          Recipe
        </h3>
        <p className="text-[0.9375rem] text-dim">
          What one burger uses. Each order takes these amounts from <Link to="/inventory" className="text-grey underline-offset-4 hover:underline">inventory</Link>, and a cancelled order puts them back.
        </p>
      </div>
      {ingredients.data && ingredients.data.length === 0 ? (
        <p className="text-sm text-grey">
          Add ingredients on the <Link to="/inventory" className="text-ember-hot hover:underline">Inventory</Link> page first.
        </p>
      ) : (
        <>
          {rows.length > 0 && (
            <ul className="space-y-2">
              {rows.map((row, i) => {
                const ing = byId.get(row.ingredient_id)
                return (
                  <li key={i} className="grid grid-cols-[1fr_7rem_auto] items-end gap-2">
                    <SelectField
                      label="Ingredient"
                      hideLabel={i > 0}
                      value={row.ingredient_id}
                      onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ingredient_id: e.target.value } : x)))}
                    >
                      <option value="">Choose…</option>
                      {(ingredients.data ?? []).map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </SelectField>
                    <TextField
                      label={`Amount${ing ? ` (${ing.unit})` : ''}`}
                      hideLabel={i > 0}
                      inputMode="decimal"
                      value={row.quantity}
                      onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))}
                    />
                    <IconButton label="Remove ingredient" className="mb-0.5 h-10 w-10" onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>
                      <X className="h-4 w-4" aria-hidden="true" />
                    </IconButton>
                  </li>
                )
              })}
            </ul>
          )}
          {error && <p className="text-[0.9375rem] text-[#ff8a83]">{error}</p>}
          <div className="flex flex-wrap justify-between gap-2">
            <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" aria-hidden="true" />} onClick={() => setRows((r) => [...r, { ingredient_id: '', quantity: '1' }])}>
              Add ingredient
            </Button>
            <Button type="submit" loading={save.isPending}>
              Save recipe
            </Button>
          </div>
        </>
      )}
    </form>
  )
}
