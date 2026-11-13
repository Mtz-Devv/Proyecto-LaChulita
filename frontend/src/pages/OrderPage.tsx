import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import api from '../api/client'
import Modal from '../components/Modal'
import { useAuth } from '../context/AuthContext'
import type { Category, Order, PaymentMethod, Product } from '../types'
import { errorMessage, money } from '../utils/format'

export default function OrderPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { hasRole } = useAuth()

  const [order, setOrder] = useState<Order | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)

  const [payOpen, setPayOpen] = useState(false)
  const [methodId, setMethodId] = useState('')
  const [tip, setTip] = useState('0')

  useEffect(() => {
    api.get<Order>(`/orders/${id}`)
      .then((res) => setOrder(res.data))
      .catch((err) => setError(errorMessage(err)))
  }, [id, reload])

  useEffect(() => {
    api.get<Product[]>('/products', { params: { all: 1, active: 1 } })
      .then((r) => setProducts(r.data))
    api.get<Category[]>('/categories', { params: { all: 1 } })
      .then((r) => setCategories(r.data))
    api.get<PaymentMethod[]>('/payment-methods', { params: { all: 1 } })
      .then((r) => setMethods(r.data))
  }, [])

  async function addProduct(product: Product) {
    setError('')
    setBusy(true)
    try {
      const res = await api.post<Order>(`/orders/${id}/items`, {
        product_id: product.id,
        quantity: 1,
        notes: notes || null,
      })
      setOrder(res.data)
      setNotes('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function pay() {
    setError('')
    try {
      await api.post(`/orders/${id}/close`, {
        payment_method_id: Number(methodId),
        tip: Number(tip),
      })
      navigate('/mesas')
    } catch (err) {
      setError(errorMessage(err))
      setPayOpen(false)
    }
  }

  async function cancel() {
    if (!confirm('¿Cancelar la cuenta? Los insumos regresan al inventario.')) return
    try {
      await api.post(`/orders/${id}/cancel`)
      navigate('/mesas')
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  if (!order) return <p className="text-gray-500">{error || 'Cargando…'}</p>

  const isOpen = order.status === 'abierta'
  const menu = categoryId ? products.filter((p) => p.category_id === categoryId) : products
  const hasItems = (order.items?.length ?? 0) > 0
  const canCancel = hasRole('admin') || !hasItems

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Mesa {order.bar_table?.number} · Cuenta #{order.id}
          </h1>
          <p className="text-sm text-gray-500">Estado: {order.status}</p>
        </div>
        <button className="btn-secondary" onClick={() => setReload((r) => r + 1)}>Actualizar</button>
      </div>

      {error && <p className="error-box">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-5">
        {isOpen && (
          <div className="card space-y-4 lg:col-span-3">
            <div className="flex flex-wrap gap-2">
              <button
                className={categoryId === null ? 'btn-primary' : 'btn-secondary'}
                onClick={() => setCategoryId(null)}
              >
                Todo
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  className={categoryId === c.id ? 'btn-primary' : 'btn-secondary'}
                  onClick={() => setCategoryId(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <input className="input" placeholder="Nota para la barra (opcional): sin hielo, doble…"
              value={notes} onChange={(e) => setNotes(e.target.value)} />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {menu.map((p) => (
                <button
                  key={p.id}
                  disabled={busy}
                  onClick={() => addProduct(p)}
                  className={`rounded-lg border border-gray-200 p-3 text-left
                    hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50`}
                >
                  <p className="font-medium">{p.name}</p>
                  <p className="text-sm text-gray-500">{money(p.price)}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={`card space-y-3 ${isOpen ? 'lg:col-span-2' : 'lg:col-span-5'}`}>
          <h2 className="font-semibold">Cuenta</h2>
          <table className="w-full">
            <tbody>
              {order.items?.map((item) => (
                <tr key={item.id}>
                  <td className="td">
                    {item.quantity} × {item.product?.name}
                    {item.notes && <p className="text-xs text-amber-700">{item.notes}</p>}
                  </td>
                  <td className="td">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                      item.status === 'listo'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="td text-right">{money(item.line_total)}</td>
                </tr>
              ))}
              {!hasItems && (
                <tr><td className="td text-gray-500" colSpan={3}>Todavía no hay productos.</td></tr>
              )}
            </tbody>
          </table>
          <div className="space-y-1 text-right text-sm">
            <p>Subtotal: {money(order.subtotal)}</p>
            {order.tip > 0 && <p>Propina: {money(order.tip)}</p>}
            <p className="text-lg font-bold">Total: {money(order.total)}</p>
          </div>
          {isOpen && (
            <div className="flex justify-between gap-2">
              {canCancel
                ? <button className="btn-danger" onClick={cancel}>Cancelar cuenta</button>
                : <span />}
              <button className="btn-primary" disabled={!hasItems} onClick={() => setPayOpen(true)}>
                Cobrar
              </button>
            </div>
          )}
        </div>
      </div>

      <Modal title="Cobrar cuenta" open={payOpen} onClose={() => setPayOpen(false)}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); pay() }}>
          <div>
            <label className="label">Método de pago</label>
            <select className="input" required value={methodId}
              onChange={(e) => setMethodId(e.target.value)}>
              <option value="">Selecciona…</option>
              {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Propina</label>
            <input className="input" type="number" min="0" step="0.01" value={tip}
              onChange={(e) => setTip(e.target.value)} />
            <div className="mt-2 flex gap-2">
              {[10, 15, 20].map((pct) => (
                <button key={pct} type="button" className="btn-secondary"
                  onClick={() => setTip(((order.subtotal * pct) / 100).toFixed(2))}>
                  {pct}%
                </button>
              ))}
            </div>
          </div>
          <p className="text-right text-lg font-bold">
            Total a cobrar: {money(order.subtotal + Number(tip || 0))}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setPayOpen(false)}>
              Cancelar
            </button>
            <button className="btn-primary">Confirmar cobro</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
