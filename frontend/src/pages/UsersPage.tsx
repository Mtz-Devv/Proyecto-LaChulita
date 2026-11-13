import { useEffect, useState } from 'react'
import api from '../api/client'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import type { Paginated, Role, User } from '../types'
import { errorMessage } from '../utils/format'

const emptyForm = { name: '', email: '', password: '', role_id: '' }

export default function UsersPage() {
  const [items, setItems] = useState<User[]>([])
  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [reload, setReload] = useState(0)
  const [roles, setRoles] = useState<Role[]>([])

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get<Role[]>('/roles').then((r) => setRoles(r.data))
  }, [])

  useEffect(() => {
    api.get<Paginated<User>>('/users', { params: { page, search } })
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

  function openEdit(u: User) {
    setEditing(u)
    setForm({ name: u.name, email: u.email, password: '', role_id: String(u.role_id ?? '') })
    setError('')
    setModalOpen(true)
  }

  async function save() {
    setSaving(true)
    setError('')
    const payload = { ...form, role_id: Number(form.role_id) }
    try {
      if (editing) await api.put(`/users/${editing.id}`, payload)
      else await api.post('/users', payload)
      setModalOpen(false)
      setReload((r) => r + 1)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function remove(u: User) {
    if (!confirm(`¿Borrar a "${u.name}"?`)) return
    try {
      await api.delete(`/users/${u.id}`)
      setReload((r) => r + 1)
    } catch (err) {
      alert(errorMessage(err))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Usuarios</h1>
        <button className="btn-primary" onClick={openCreate}>+ Nuevo usuario</button>
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
              <th className="th">Correo</th>
              <th className="th">Rol</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id}>
                <td className="td font-medium">{u.name}</td>
                <td className="td">{u.email}</td>
                <td className="td">{u.role?.name}</td>
                <td className="td space-x-3 text-right">
                  <button className="btn-link" onClick={() => openEdit(u)}>Editar</button>
                  <button className="btn-danger" onClick={() => remove(u)}>Borrar</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td className="td text-gray-500" colSpan={4}>No hay usuarios.</td></tr>
            )}
          </tbody>
        </table>
        <Pagination page={page} lastPage={lastPage} onChange={setPage} />
      </div>

      <Modal title={editing ? 'Editar usuario' : 'Nuevo usuario'}
        open={modalOpen} onClose={() => setModalOpen(false)}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save() }}>
          {error && <p className="error-box">{error}</p>}
          <div>
            <label className="label">Nombre</label>
            <input className="input" required value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Correo</label>
            <input className="input" type="email" required value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="label">Contraseña</label>
            <input className="input" type="password" minLength={8} required={!editing}
              placeholder={editing ? 'Déjala vacía para no cambiarla' : 'Mínimo 8 caracteres'}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div>
            <label className="label">Rol</label>
            <select className="input" required value={form.role_id}
              onChange={(e) => setForm({ ...form, role_id: e.target.value })}>
              <option value="">Selecciona…</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
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
