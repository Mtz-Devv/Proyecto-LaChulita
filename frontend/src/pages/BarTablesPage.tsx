import { useEffect, useState } from 'react'
import api from '../api/client'
import Modal from '../components/Modal'
import type { BarTable } from '../types'
import { errorMessage } from '../utils/format'

const emptyForm = { number: '', capacity: '4' }

export default function BarTablesPage() {
  const [items, setItems] = useState<BarTable[]>([])
  const [reload, setReload] = useState(0)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<BarTable | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get<BarTable[]>('/bar-tables')
      .then((res) => setItems(res.data))
      .catch((err) => alert(errorMessage(err)))
  }, [reload])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError('')
    setModalOpen(true)
  }

  function openEdit(t: BarTable) {
    setEditing(t)
    setForm({ number: String(t.number), capacity: String(t.capacity) })
    setError('')
    setModalOpen(true)
  }

  async function save() {
    setSaving(true)
    setError('')
    const payload = { number: Number(form.number), capacity: Number(form.capacity) }
    try {
      if (editing) await api.put(`/bar-tables/${editing.id}`, payload)
      else await api.post('/bar-tables', payload)
      setModalOpen(false)
      setReload((r) => r + 1)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function remove(t: BarTable) {
    if (!confirm(`¿Borrar la mesa ${t.number}?`)) return
    try {
      await api.delete(`/bar-tables/${t.id}`)
      setReload((r) => r + 1)
    } catch (err) {
      alert(errorMessage(err))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Administrar mesas</h1>
        <button className="btn-primary" onClick={openCreate}>+ Nueva mesa</button>
      </div>

      <div className="card">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Mesa</th>
              <th className="th">Capacidad</th>
              <th className="th">Estado</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id}>
                <td className="td font-medium">{t.number}</td>
                <td className="td">{t.capacity} personas</td>
                <td className="td">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${
                    t.status === 'libre'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {t.status}
                  </span>
                </td>
                <td className="td space-x-3 text-right">
                  <button className="btn-link" onClick={() => openEdit(t)}>Editar</button>
                  <button className="btn-danger" onClick={() => remove(t)}>Borrar</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td className="td text-gray-500" colSpan={4}>No hay mesas.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal title={editing ? 'Editar mesa' : 'Nueva mesa'}
        open={modalOpen} onClose={() => setModalOpen(false)}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save() }}>
          {error && <p className="error-box">{error}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Número de mesa</label>
              <input className="input" type="number" min="1" required value={form.number}
                onChange={(e) => setForm({ ...form, number: e.target.value })} />
            </div>
            <div>
              <label className="label">Capacidad</label>
              <input className="input" type="number" min="1" max="30" required
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
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
