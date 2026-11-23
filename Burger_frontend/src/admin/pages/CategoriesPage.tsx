import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Tags, Trash } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { cn } from '../../lib/utils'
import { Modal } from '../components/overlay'
import { useConfirm, useToast } from '../components/overlay-context'
import { Badge, Button, Card, EmptyState, ErrorState, IconButton, Skeleton, Switch, Table, TextArea, TextField, ToggleSwitch, td, th } from '../components/ui'
import { PageHeader } from '../layout'
import { ApiError, errorMessage } from '../lib/api'
import { categories } from '../lib/endpoints'
import type { Category } from '../lib/types'

export default function CategoriesPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const list = useQuery({ queryKey: ['categories'], queryFn: categories.list })
  const [editing, setEditing] = useState<Category | 'new' | null>(null)

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['categories'] })
    queryClient.invalidateQueries({ queryKey: ['products'] })
  }
  const toggle = useMutation({
    mutationFn: (c: Category) => categories.update(c.id, { is_active: !c.is_active }),
    onSuccess: (c) => {
      invalidate()
      toast.success(`${c.name} is ${c.is_active ? 'shown' : 'hidden'} on the website.`)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const remove = useMutation({
    mutationFn: (c: Category) => categories.remove(c.id),
    onSuccess: (_, c) => {
      invalidate()
      toast.success(`Deleted ${c.name}.`)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  return (
    <>
      <PageHeader
        title="Categories"
        description="Menu filters such as Beef, Chicken and Spicy. A product can sit in several."
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" aria-hidden="true" />} onClick={() => setEditing('new')}>
            Add category
          </Button>
        }
      />
      <Card>
        {list.isError ? (
          <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
        ) : !list.data ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : list.data.length === 0 ? (
          <EmptyState icon={<Tags className="h-5 w-5" />} title="No categories yet" action={<Button variant="primary" onClick={() => setEditing('new')}>Add a category</Button>}>
            Products need at least one category.
          </EmptyState>
        ) : (
          <Table label="Categories">
            <thead>
              <tr>
                <th className={th}>Category</th>
                <th className={th}>Description</th>
                <th className={cn(th, 'text-right')}>Products</th>
                <th className={cn(th, 'text-right')}>Position</th>
                <th className={th}>On the website</th>
                <th className={cn(th, 'text-right')}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((c) => (
                <tr key={c.id} className="hover:bg-bone/[0.02]">
                  <td className={td}>
                    <p className="font-medium text-bone">{c.name}</p>
                    <p className="text-xs text-dim">/{c.slug}</p>
                  </td>
                  <td className={cn(td, 'max-w-[22rem] text-grey')}>
                    <p className="truncate">{c.description || <span className="text-dim">No description</span>}</p>
                  </td>
                  <td className={cn(td, 'tabular text-right')}>
                    <Link to={`/products?category=${c.slug}`} className="text-bone hover:text-ember-hot">
                      {c.products_count ?? 0}
                    </Link>
                  </td>
                  <td className={cn(td, 'tabular text-right text-grey')}>{c.sort_order}</td>
                  <td className={td}>
                    <ToggleSwitch label={`Show ${c.name} on the website`} checked={c.is_active} onChange={() => toggle.mutate(c)} />
                    {!c.is_active && <Badge className="ml-2">Hidden</Badge>}
                  </td>
                  <td className={cn(td, 'text-right')}>
                    <div className="inline-flex">
                      <IconButton label={`Edit ${c.name}`} onClick={() => setEditing(c)}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        label={`Delete ${c.name}`}
                        className="hover:text-[#ff8a83]"
                        onClick={async () => {
                          if (
                            await confirm({
                              title: `Delete ${c.name}?`,
                              body: c.products_count ? `${c.products_count} products lose this category. The products themselves stay on the menu.` : 'No products use it.',
                              confirmLabel: 'Delete category',
                            })
                          )
                            remove.mutate(c)
                        }}
                      >
                        <Trash className="h-4 w-4" aria-hidden="true" />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <CategoryModal key={editing === 'new' ? 'new' : (editing?.id ?? 'closed')} category={editing} onClose={() => setEditing(null)} />
    </>
  )
}

function CategoryModal({ category, onClose }: { category: Category | 'new' | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const existing = category && category !== 'new' ? category : null
  const [name, setName] = useState(existing?.name ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [sortOrder, setSortOrder] = useState(String(existing?.sort_order ?? 0))
  const [active, setActive] = useState(existing?.is_active ?? true)
  const [errors, setErrors] = useState<{ name?: string; description?: string }>({})

  const save = useMutation({
    mutationFn: () => {
      const input = { name: name.trim(), description: description.trim() || null, sort_order: Number(sortOrder) || 0, is_active: active }
      return existing ? categories.update(existing.id, input) : categories.create(input)
    },
    onSuccess: (c) => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success(existing ? `Saved ${c.name}.` : `Added ${c.name}.`)
      onClose()
    },
    onError: (e) => {
      const err = ApiError.from(e)
      setErrors({ name: err.field('name') ?? err.field('slug') ?? (err.code !== 'validation_failed' ? err.message : undefined), description: err.field('description') })
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setErrors({ name: 'Give the category a name.' })
    save.mutate()
  }

  return (
    <Modal
      open={category !== null}
      onClose={onClose}
      title={existing ? `Edit ${existing.name}` : 'New category'}
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="category-form" loading={save.isPending}>
            {existing ? 'Save category' : 'Add category'}
          </Button>
        </>
      }
    >
      <form id="category-form" noValidate onSubmit={submit} className="space-y-4">
        <TextField label="Name" value={name} maxLength={80} onChange={(e) => {
            setName(e.target.value)
            setErrors({})
          }} error={errors.name} hint={!existing ? 'Its web address is made from the name.' : undefined} />
        <TextArea label="Description" optional value={description} maxLength={500} rows={2} onChange={(e) => setDescription(e.target.value)} error={errors.description} />
        <TextField label="Position" type="number" min={0} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} hint="Lower numbers come first in the menu filters." />
        <Switch checked={active} onChange={setActive} label="Show on the website" />
      </form>
    </Modal>
  )
}
