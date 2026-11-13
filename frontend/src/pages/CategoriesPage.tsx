import { useEffect, useState } from 'react'
import api from '../api/client'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import type { Category, Paginated } from '../types'
import { errorMessage } from '../utils/format'

const emptyForm = { name: '', description: '' }

export default function CategoriesPage() {
  const [items, setItems] = useState<Category[]>([])
  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [reload, setReload] = useState(0)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get<Paginated<Category>>('/categories', { params: { page, search } })
      .then((res) => {
        setItems(res.data.data)
        setLastPage(res.data.last_page)
      })
      .catch((err) => alert(errorMessage(err)))
  }, [page, search, reload])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError('')
    setModalOpen(true)
  }

  function openEdit(category: Category) {
    setEditing(category)
    setForm({ name: category.name, description: category.description ?? '' })
    setError('')
    setModalOpen(true)
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      if (editing) {
        await api.put(`/categories/${editing.id}`, form)
      } else {
        await api.post('/categories', form)
      }
      setModalOpen(false)
      setReload((r) => r + 1)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function remove(category: Category) {
    if (!confirm(`¿Borrar la categoría "${category.name}"?`)) return
    try {
      await api.delete(`/categories/${category.id}`)
      setReload((r) => r + 1)
    } catch (err) {
      alert(errorMessage(err))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Categorías</h1>
        <button className="btn-primary" onClick={openCreate}>+ Nueva categoría</button>
      </div>

      <div className="card">
        <form className="mb-4 flex gap-2"
          onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(searchInput) }}>
          <input className="input max-w-xs" placeholder="Buscar…"
            value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          <button className="btn-secondary">Buscar</button>
        </form>

        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Nombre</th>
              <th className="th">Descripción</th>
              <th className="th">Productos</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td className="td font-medium">{c.name}</td>
                <td className="td text-gray-500">{c.description}</td>
                <td className="td">{c.products_count}</td>
                <td className="td space-x-3 text-right">
                  <button className="btn-link" onClick={() => openEdit(c)}>Editar</button>
                  <button className="btn-danger" onClick={() => remove(c)}>Borrar</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td className="td text-gray-500" colSpan={4}>No hay categorías.</td></tr>
            )}
          </tbody>
        </table>
        <Pagination page={page} lastPage={lastPage} onChange={setPage} />
      </div>

      <Modal title={editing ? 'Editar categoría' : 'Nueva categoría'}
        open={modalOpen} onClose={() => setModalOpen(false)}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save() }}>
          {error && <p className="error-box">{error}</p>}
          <div>
            <label className="label">Nombre</label>
            <input className="input" required value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Descripción</label>
            <textarea className="input" rows={3} value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
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
