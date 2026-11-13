import { useEffect, useState } from 'react'
import api from '../api/client'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import { useAuth } from '../context/AuthContext'
import type { Ingredient, Paginated, Supplier } from '../types'
import { errorMessage, money } from '../utils/format'

const emptyForm = { name: '', unit: 'ml', min_stock: '', cost: '', supplier_ids: [] as number[] }

export default function IngredientsPage() {
  const { hasRole } = useAuth()
  const isAdmin = hasRole('admin')

  const [items, setItems] = useState<Ingredient[]>([])
  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [onlyLow, setOnlyLow] = useState(false)
  const [reload, setReload] = useState(0)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Ingredient | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')

  const [adjusting, setAdjusting] = useState<Ingredient | null>(null)
  const [newStock, setNewStock] = useState('')
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (isAdmin) {
      api.get<Supplier[]>('/suppliers', { params: { all: 1 } }).then((r) => setSuppliers(r.data))
    }
  }, [isAdmin])

  useEffect(() => {
    api.get<Paginated<Ingredient>>('/ingredients', { params: { page, low: onlyLow ? 1 : 0 } })
      .then((res) => {
        setItems(res.data.data)
        setLastPage(res.data.last_page)
      })
      .catch((err) => alert(errorMessage(err)))
  }, [page, onlyLow, reload])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError('')
    setModalOpen(true)
  }

  function openEdit(i: Ingredient) {
    setEditing(i)
    setForm({
      name: i.name, unit: i.unit, min_stock: String(i.min_stock), cost: String(i.cost),
      supplier_ids: (i.suppliers ?? []).map((link) => link.supplier_id),
    })
    setError('')
    setModalOpen(true)
  }

  function toggleSupplier(id: number) {
    setForm({
      ...form,
      supplier_ids: form.supplier_ids.includes(id)
        ? form.supplier_ids.filter((s) => s !== id)
        : [...form.supplier_ids, id],
    })
  }

  async function save() {
    setError('')
    const payload = { ...form, min_stock: Number(form.min_stock), cost: Number(form.cost) }
    try {
      if (editing) await api.put(`/ingredients/${editing.id}`, payload)
      else await api.post('/ingredients', payload)
      setModalOpen(false)
      setReload((r) => r + 1)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function remove(i: Ingredient) {
    if (!confirm(`¿Borrar "${i.name}"?`)) return
    try {
      await api.delete(`/ingredients/${i.id}`)
      setReload((r) => r + 1)
    } catch (err) {
      alert(errorMessage(err))
    }
  }

  function openAdjust(i: Ingredient) {
    setAdjusting(i)
    setNewStock(String(i.stock))
    setReason('')
    setError('')
  }

  async function saveAdjust() {
    if (!adjusting) return
    try {
      await api.post(`/ingredients/${adjusting.id}/adjust`, { stock: Number(newStock), reason })
      setAdjusting(null)
      setReload((r) => r + 1)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Insumos</h1>
        {isAdmin && <button className="btn-primary" onClick={openCreate}>+ Nuevo insumo</button>}
      </div>

      <div className="card">
        <label className="mb-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyLow}
            onChange={(e) => { setPage(1); setOnlyLow(e.target.checked) }} />
          Solo los que están en su mínimo o abajo
        </label>

        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Insumo</th>
              <th className="th">Stock</th>
              <th className="th">Mínimo</th>
              <th className="th">Costo</th>
              <th className="th">Proveedores</th>
              {isAdmin && <th className="th"></th>}
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td className="td font-medium">{i.name}</td>
                <td className={`td ${i.stock <= i.min_stock ? 'font-bold text-red-600' : ''}`}>
                  {i.stock} {i.unit}
                </td>
                <td className="td text-gray-500">{i.min_stock} {i.unit}</td>
                <td className="td">{money(i.cost)}</td>
                <td className="td text-xs">
                  {i.suppliers?.map((link) => link.supplier?.name).join(', ') || '—'}
                </td>
                {isAdmin && (
                  <td className="td space-x-3 whitespace-nowrap text-right">
                    <button className="btn-link" onClick={() => openAdjust(i)}>Ajustar</button>
                    <button className="btn-link" onClick={() => openEdit(i)}>Editar</button>
                    <button className="btn-danger" onClick={() => remove(i)}>Borrar</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={page} lastPage={lastPage} onChange={setPage} />
      </div>

      <Modal title={editing ? 'Editar insumo' : 'Nuevo insumo'}
        open={modalOpen} onClose={() => setModalOpen(false)}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save() }}>
          {error && <p className="error-box">{error}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Nombre</label>
              <input className="input" required value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Unidad</label>
              <select className="input" value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                <option value="ml">Mililitros (ml)</option>
                <option value="pza">Piezas (pza)</option>
                <option value="g">Gramos (g)</option>
              </select>
            </div>
            <div>
              <label className="label">Stock mínimo</label>
              <input className="input" type="number" step="0.01" min="0" required
                value={form.min_stock}
                onChange={(e) => setForm({ ...form, min_stock: e.target.value })} />
            </div>
            <div>
              <label className="label">Costo por unidad</label>
              <input className="input" type="number" step="0.01" min="0" required value={form.cost}
                onChange={(e) => setForm({ ...form, cost: e.target.value })} />
            </div>
          </div>
          <div className="rounded-lg bg-amber-50 p-3">
            <p className="mb-2 text-sm font-semibold">Proveedores que lo surten</p>
            {suppliers.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.supplier_ids.includes(s.id)}
                  onChange={() => toggleSupplier(s.id)} />
                {s.name}
              </label>
            ))}
          </div>
          {!editing && (
            <p className="text-xs text-gray-500">
              Empieza con stock 0; el stock sube con compras o con un ajuste.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </button>
            <button className="btn-primary">Guardar</button>
          </div>
        </form>
      </Modal>

      <Modal title={`Ajustar: ${adjusting?.name ?? ''}`} open={adjusting !== null}
        onClose={() => setAdjusting(null)}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); saveAdjust() }}>
          {error && <p className="error-box">{error}</p>}
          <div>
            <label className="label">Cantidad real contada ({adjusting?.unit})</label>
            <input className="input" type="number" step="0.01" min="0" required value={newStock}
              onChange={(e) => setNewStock(e.target.value)} />
          </div>
          <div>
            <label className="label">Motivo</label>
            <input className="input" required placeholder="Ej. botella rota, conteo de cierre"
              value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setAdjusting(null)}>
              Cancelar
            </button>
            <button className="btn-primary">Guardar ajuste</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
