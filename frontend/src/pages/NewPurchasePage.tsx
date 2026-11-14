import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import api from '../api/client'
import type { Ingredient, Supplier } from '../types'
import { errorMessage, money } from '../utils/format'

interface Line { ingredient: Ingredient; quantity: string; unit_cost: string }

export default function NewPurchasePage() {
  const navigate = useNavigate()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [ingredientId, setIngredientId] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get<Supplier[]>('/suppliers', { params: { all: 1 } })
      .then((r) => setSuppliers(r.data))
    api.get<Ingredient[]>('/ingredients', { params: { all: 1 } })
      .then((r) => setIngredients(r.data))
  }, [])

  const available = ingredients.filter((i) =>
    i.suppliers?.some((link) => link.supplier_id === Number(supplierId)),
  )

  function changeSupplier(id: string) {
    setSupplierId(id)
    setLines([])
    setIngredientId('')
  }

  function addLine() {
    const ingredient = available.find((i) => i.id === Number(ingredientId))
    if (!ingredient || lines.some((l) => l.ingredient.id === ingredient.id)) return
    const link = ingredient.suppliers?.find((s) => s.supplier_id === Number(supplierId))
    const price = link?.price ?? ingredient.cost
    setLines([...lines, { ingredient, quantity: '', unit_cost: String(price) }])
    setIngredientId('')
  }

  function updateLine(index: number, field: 'quantity' | 'unit_cost', value: string) {
    setLines(lines.map((l, i) => (i === index ? { ...l, [field]: value } : l)))
  }

  function removeLine(index: number) {
    setLines(lines.filter((_, i) => i !== index))
  }

  const total = lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unit_cost), 0)

  async function save() {
    setError('')
    if (!supplierId || lines.length === 0) {
      setError('Elige un proveedor y agrega al menos un insumo.')
      return
    }
    setSaving(true)
    try {
      await api.post('/purchases', {
        supplier_id: Number(supplierId),
        items: lines.map((l) => ({
          ingredient_id: l.ingredient.id,
          quantity: Number(l.quantity),
          unit_cost: Number(l.unit_cost),
        })),
      })
      navigate('/compras')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Nueva compra</h1>
      {error && <p className="error-box">{error}</p>}

      <div className="card space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Proveedor</label>
            <select className="input" value={supplierId}
              onChange={(e) => changeSupplier(e.target.value)}>
              <option value="">Selecciona…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="label">Insumo</label>
              <select className="input" disabled={!supplierId} value={ingredientId}
                onChange={(e) => setIngredientId(e.target.value)}>
                <option value="">{supplierId ? 'Selecciona…' : 'Primero elige proveedor'}</option>
                {available.map((i) => (
                  <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                ))}
              </select>
            </div>
            <button className="btn-primary" onClick={addLine} disabled={!ingredientId}>
              Agregar
            </button>
          </div>
        </div>

        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Insumo</th>
              <th className="th">Cantidad</th>
              <th className="th">Costo unitario</th>
              <th className="th">Importe</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, index) => (
              <tr key={l.ingredient.id}>
                <td className="td">{l.ingredient.name}</td>
                <td className="td">
                  <div className="flex items-center gap-1">
                    <input className="input w-28" type="number" min="0.01" step="0.01"
                      value={l.quantity}
                      onChange={(e) => updateLine(index, 'quantity', e.target.value)} />
                    <span className="text-xs text-gray-500">{l.ingredient.unit}</span>
                  </div>
                </td>
                <td className="td">
                  <input className="input w-28" type="number" min="0" step="0.01"
                    value={l.unit_cost}
                    onChange={(e) => updateLine(index, 'unit_cost', e.target.value)} />
                </td>
                <td className="td">{money(Number(l.quantity) * Number(l.unit_cost))}</td>
                <td className="td text-right">
                  <button className="btn-link text-red-600" onClick={() => removeLine(index)}>
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr><td className="td text-gray-500" colSpan={5}>Agrega insumos a la compra.</td></tr>
            )}
          </tbody>
        </table>

        <div className="flex items-center justify-between">
          <p className="text-lg font-bold">Total: {money(total)}</p>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Guardando…' : 'Registrar compra'}
          </button>
        </div>
      </div>
    </div>
  )
}
