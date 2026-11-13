import { useEffect, useState } from 'react'
import api from '../api/client'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import type { Category, Ingredient, Paginated, Product } from '../types'
import { errorMessage, money } from '../utils/format'

interface RecipeLine { ingredient_id: string; quantity: string }

const emptyForm = {
  name: '', description: '', price: '', category_id: '', is_active: true,
  recipe: [] as RecipeLine[],
}

export default function ProductsPage() {
  const [items, setItems] = useState<Product[]>([])
  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [reload, setReload] = useState(0)

  const [categories, setCategories] = useState<Category[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get<Category[]>('/categories', { params: { all: 1 } }).then((r) => setCategories(r.data))
    api.get<Ingredient[]>('/ingredients', { params: { all: 1 } }).then((r) => setIngredients(r.data))
  }, [])

  useEffect(() => {
    api.get<Paginated<Product>>('/products', { params: { page, category_id: categoryFilter } })
      .then((res) => {
        setItems(res.data.data)
        setLastPage(res.data.last_page)
      })
      .catch((err) => alert(errorMessage(err)))
  }, [page, categoryFilter, reload])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError('')
    setModalOpen(true)
  }

  function openEdit(p: Product) {
    setEditing(p)
    setForm({
      name: p.name,
      description: p.description ?? '',
      price: String(p.price),
      category_id: String(p.category_id),
      is_active: p.is_active,
      recipe: (p.recipe ?? []).map((line) => ({
        ingredient_id: String(line.ingredient_id),
        quantity: String(line.quantity),
      })),
    })
    setError('')
    setModalOpen(true)
  }

  function addLine() {
    setForm({ ...form, recipe: [...form.recipe, { ingredient_id: '', quantity: '' }] })
  }

  function updateLine(index: number, field: keyof RecipeLine, value: string) {
    setForm({
      ...form,
      recipe: form.recipe.map((line, i) => (i === index ? { ...line, [field]: value } : line)),
    })
  }

  function removeLine(index: number) {
    setForm({ ...form, recipe: form.recipe.filter((_, i) => i !== index) })
  }

  const unitOf = (id: string) => ingredients.find((i) => i.id === Number(id))?.unit ?? ''

  async function save() {
    setSaving(true)
    setError('')
    const payload = {
      name: form.name,
      description: form.description,
      price: Number(form.price),
      category_id: Number(form.category_id),
      is_active: form.is_active,
      recipe: form.recipe.map((line) => ({
        ingredient_id: Number(line.ingredient_id),
        quantity: Number(line.quantity),
      })),
    }
    try {
      if (editing) await api.put(`/products/${editing.id}`, payload)
      else await api.post('/products', payload)
      setModalOpen(false)
      setReload((r) => r + 1)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function remove(p: Product) {
    if (!confirm(`¿Borrar "${p.name}"?`)) return
    try {
      await api.delete(`/products/${p.id}`)
      setReload((r) => r + 1)
    } catch (err) {
      alert(errorMessage(err))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Menú y recetas</h1>
        <button className="btn-primary" onClick={openCreate}>+ Nuevo producto</button>
      </div>

      <div className="card">
        <select className="input mb-4 max-w-xs" value={categoryFilter}
          onChange={(e) => { setPage(1); setCategoryFilter(e.target.value) }}>
          <option value="">Todas las categorías</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Producto</th>
              <th className="th">Categoría</th>
              <th className="th">Precio</th>
              <th className="th">Receta</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className={p.is_active ? '' : 'opacity-50'}>
                <td className="td font-medium">{p.name}</td>
                <td className="td">{p.category?.name}</td>
                <td className="td">{money(p.price)}</td>
                <td className="td text-xs text-gray-600">
                  {p.recipe?.length
                    ? p.recipe
                        .map((line) => `${line.ingredient?.name} ${line.quantity} ${line.ingredient?.unit}`)
                        .join(', ')
                    : 'Sin receta'}
                </td>
                <td className="td space-x-3 whitespace-nowrap text-right">
                  <button className="btn-link" onClick={() => openEdit(p)}>Editar</button>
                  <button className="btn-danger" onClick={() => remove(p)}>Borrar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={page} lastPage={lastPage} onChange={setPage} />
      </div>

      <Modal title={editing ? 'Editar producto' : 'Nuevo producto'}
        open={modalOpen} onClose={() => setModalOpen(false)}>
        <form className="grid grid-cols-2 gap-4" onSubmit={(e) => { e.preventDefault(); save() }}>
          {error && <p className="error-box col-span-2">{error}</p>}
          <div>
            <label className="label">Nombre</label>
            <input className="input" required value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Precio</label>
            <input className="input" type="number" step="0.01" min="0" required value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </div>
          <div>
            <label className="label">Categoría</label>
            <select className="input" required value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">Selecciona…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            Disponible en el menú
          </label>
          <div className="col-span-2">
            <label className="label">Descripción</label>
            <textarea className="input" rows={2} value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          <div className="col-span-2 space-y-2 rounded-lg bg-amber-50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Receta (insumos por porción)</span>
              <button type="button" className="btn-link" onClick={addLine}>+ Agregar insumo</button>
            </div>
            {form.recipe.map((line, index) => (
              <div key={index} className="flex items-center gap-2">
                <select className="input" required value={line.ingredient_id}
                  onChange={(e) => updateLine(index, 'ingredient_id', e.target.value)}>
                  <option value="">Insumo…</option>
                  {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
                <input className="input w-24" type="number" step="0.01" min="0.01" required
                  placeholder="Cant." value={line.quantity}
                  onChange={(e) => updateLine(index, 'quantity', e.target.value)} />
                <span className="w-8 text-xs text-gray-500">{unitOf(line.ingredient_id)}</span>
                <button type="button" className="btn-danger" onClick={() => removeLine(index)}>
                  ✕
                </button>
              </div>
            ))}
            {form.recipe.length === 0 && (
              <p className="text-xs text-gray-500">Sin receta: no descontará inventario.</p>
            )}
          </div>

          <div className="col-span-2 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </button>
            <button className="btn-primary" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
