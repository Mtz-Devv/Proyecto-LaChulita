import { useEffect, useState } from 'react'
import api from '../api/client'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import type { Paginated, PaymentMethod } from '../types'
import { errorMessage } from '../utils/format'

const emptyForm = { name: '' }

export default function PaymentMethodsPage() {
  const [items, setItems] = useState<PaymentMethod[]>([])
  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [reload, setReload] = useState(0)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<PaymentMethod | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get<Paginated<PaymentMethod>>('/payment-methods', { params: { page, search } })
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

  function openEdit(m: PaymentMethod) {
    setEditing(m)
    setForm({ name: m.name })
    setError('')
    setModalOpen(true)
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      if (editing) await api.put(`/payment-methods/${editing.id}`, form)
      else await api.post('/payment-methods', form)
      setModalOpen(false)
      setReload((r) => r + 1)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function remove(m: PaymentMethod) {
    if (!confirm(`¿Borrar el método "${m.name}"?`)) return
    try {
      await api.delete(`/payment-methods/${m.id}`)
      setReload((r) => r + 1)
    } catch (err) {
      alert(errorMessage(err))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Métodos de pago</h1>
        <button className="btn-primary" onClick={openCreate}>+ Nuevo método</button>
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
              <th className="th"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id}>
                <td className="td font-medium">{m.name}</td>
                <td className="td space-x-3 text-right">
                  <button className="btn-link" onClick={() => openEdit(m)}>Editar</button>
                  <button className="btn-danger" onClick={() => remove(m)}>Borrar</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td className="td text-gray-500" colSpan={2}>No hay métodos de pago.</td></tr>
            )}
          </tbody>
        </table>
        <Pagination page={page} lastPage={lastPage} onChange={setPage} />
      </div>

      <Modal title={editing ? 'Editar método de pago' : 'Nuevo método de pago'}
        open={modalOpen} onClose={() => setModalOpen(false)}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save() }}>
          {error && <p className="error-box">{error}</p>}
          <div>
            <label className="label">Nombre</label>
            <input className="input" required value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
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
