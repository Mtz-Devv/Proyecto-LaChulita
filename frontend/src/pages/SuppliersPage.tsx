import { useEffect, useState } from 'react'
import api from '../api/client'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import type { Paginated, Supplier } from '../types'
import { errorMessage } from '../utils/format'

const emptyForm = { name: '', contact_name: '', phone: '', email: '' }

export default function SuppliersPage() {
  const [items, setItems] = useState<Supplier[]>([])
  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [reload, setReload] = useState(0)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get<Paginated<Supplier>>('/suppliers', { params: { page, search } })
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

  function openEdit(s: Supplier) {
    setEditing(s)
    setForm({
      name: s.name,
      contact_name: s.contact_name ?? '',
      phone: s.phone ?? '',
      email: s.email ?? '',
    })
    setError('')
    setModalOpen(true)
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      if (editing) await api.put(`/suppliers/${editing.id}`, form)
      else await api.post('/suppliers', form)
      setModalOpen(false)
      setReload((r) => r + 1)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function remove(s: Supplier) {
    if (!confirm(`¿Borrar el proveedor "${s.name}"?`)) return
    try {
      await api.delete(`/suppliers/${s.id}`)
      setReload((r) => r + 1)
    } catch (err) {
      alert(errorMessage(err))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Proveedores</h1>
        <button className="btn-primary" onClick={openCreate}>+ Nuevo proveedor</button>
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
              <th className="th">Contacto</th>
              <th className="th">Teléfono</th>
              <th className="th">Correo</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id}>
                <td className="td font-medium">{s.name}</td>
                <td className="td">{s.contact_name}</td>
                <td className="td">{s.phone}</td>
                <td className="td">{s.email}</td>
                <td className="td space-x-3 whitespace-nowrap text-right">
                  <button className="btn-link" onClick={() => openEdit(s)}>Editar</button>
                  <button className="btn-danger" onClick={() => remove(s)}>Borrar</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td className="td text-gray-500" colSpan={5}>No hay proveedores.</td></tr>
            )}
          </tbody>
        </table>
        <Pagination page={page} lastPage={lastPage} onChange={setPage} />
      </div>

      <Modal title={editing ? 'Editar proveedor' : 'Nuevo proveedor'}
        open={modalOpen} onClose={() => setModalOpen(false)}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save() }}>
          {error && <p className="error-box">{error}</p>}
          <div>
            <label className="label">Nombre</label>
            <input className="input" required value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Contacto</label>
            <input className="input" value={form.contact_name}
              onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Teléfono</label>
              <input className="input" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="label">Correo</label>
              <input className="input" type="email" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
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
